/**
 * Testes do banco: executam as migrations reais num PostgreSQL (PGlite, Postgres 18 em WASM)
 * com um "auth" mínimo equivalente ao do Supabase (auth.users + auth.uid()).
 * Validam RLS, isolamento entre usuários, atomicidade e idempotência.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(__dirname, "../migrations");
const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

const AUTH_STUB = `
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated nologin;
create role anon nologin;
grant usage on schema public to authenticated, anon;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
`;

let db: PGlite;

async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${uid ? "authenticated" : "anon"}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(path.join(MIGRATIONS, f), "utf8"));
    } catch (e) {
      throw new Error(`Migration ${f} falhou: ${(e as Error).message}`);
    }
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'alice@nexo.test'), ($2, 'bob@nexo.test')`, [ALICE, BOB]);
});

async function newAccount(uid: string, name: string, opening = 0): Promise<string> {
  return as(uid, async () => (await one<{ id: string }>(
    `insert into accounts (name, opening_balance_cents, opening_date) values ($1, $2, '2026-10-01') returning id`,
    [name, opening],
  )).id);
}

async function balance(uid: string, accountId: string): Promise<number> {
  return as(uid, async () => Number((await one<{ b: string }>(
    `select a.opening_balance_cents + coalesce(sum(e.amount_cents) filter (where e.status = 'confirmed' and e.deleted_at is null), 0) as b
       from accounts a left join account_entries e on e.account_id = a.id where a.id = $1 group by a.id`,
    [accountId],
  )).b));
}

describe("cadastro de usuário", () => {
  it("cria perfil com tema escuro padrão e categorias iniciais", async () => {
    const p = await as(ALICE, () => one<{ theme: string; timezone: string }>(`select theme, timezone from profiles`));
    expect(p).toEqual({ theme: "dark", timezone: "America/Sao_Paulo" });
    const cats = await as(ALICE, () => q<{ name: string }>(`select name from categories where parent_id is null order by sort_order`));
    expect(cats.map((c) => c.name)).toEqual(["Transporte", "Colecionáveis e hobbies", "Assinaturas", "Despesas gerais", "Receitas"]);
    const pokemon = await as(ALICE, () => q(`select 1 from categories where name = 'Cartas Pokémon'`));
    expect(pokemon).toHaveLength(1);
  });
});

describe("[14] isolamento de dados entre usuários (RLS)", () => {
  it("um usuário não vê, altera nem apaga dados do outro", async () => {
    const aliceAcc = await newAccount(ALICE, "Nubank Alice", 100000);
    expect(await as(BOB, () => q(`select * from accounts where id = $1`, [aliceAcc]))).toHaveLength(0);
    expect(await as(BOB, () => q(`select * from categories`))).not.toHaveLength(0); // só as dele
    const bobSeesAlice = await as(BOB, () => q(`select * from categories where user_id = $1`, [ALICE]));
    expect(bobSeesAlice).toHaveLength(0);

    const upd = await as(BOB, () => db.query(`update accounts set opening_balance_cents = 0 where id = $1`, [aliceAcc]));
    expect(upd.affectedRows).toBe(0);
    const del = await as(BOB, () => db.query(`delete from accounts where id = $1`, [aliceAcc]));
    expect(del.affectedRows).toBe(0);
    expect(await balance(ALICE, aliceAcc)).toBe(100000);
  });

  it("não é possível inserir dados em nome de outro usuário", async () => {
    await expect(as(BOB, () => q(`insert into accounts (user_id, name, opening_date) values ($1, 'x', '2026-10-01')`, [ALICE]))).rejects.toThrow(/row-level security/);
  });

  it("FK composta impede lançar na conta de outro usuário mesmo sabendo o id", async () => {
    const aliceAcc = await newAccount(ALICE, "Conta secreta");
    await expect(
      as(BOB, () => q(`insert into account_entries (account_id, kind, status, amount_cents, occurred_on) values ($1, 'expense', 'confirmed', -100, '2026-10-02')`, [aliceAcc])),
    ).rejects.toThrow(/foreign key/);
  });

  it("usuário anônimo não acessa nada", async () => {
    await expect(as(null, () => q(`select * from accounts`))).rejects.toThrow(/permission denied/);
    await expect(as(null, () => q(`select create_transfer(gen_random_uuid(), gen_random_uuid(), 1, '2026-10-01')`))).rejects.toThrow(/permission denied/);
  });

  it("auditoria é visível só para o dono e não pode ser alterada pelo cliente", async () => {
    const n = await as(ALICE, () => one<{ n: number }>(`select count(*)::int n from audit_log`));
    expect(n.n).toBeGreaterThan(0);
    const bob = await as(BOB, () => q(`select * from audit_log where user_id = $1`, [ALICE]));
    expect(bob).toHaveLength(0);
    await expect(as(ALICE, () => q(`delete from audit_log`))).rejects.toThrow(/permission denied/);
  });
});

describe("[5] transferência atômica", () => {
  it("move o valor e mantém o consolidado", async () => {
    const a = await newAccount(ALICE, "Nubank", 50000);
    const b = await newAccount(ALICE, "Santander", 10000);
    await as(ALICE, () => q(`select create_transfer($1, $2, 10000, '2026-10-02')`, [a, b]));
    expect(await balance(ALICE, a)).toBe(40000);
    expect(await balance(ALICE, b)).toBe(20000);
  });

  it("um lado sozinho é rejeitado no commit", async () => {
    const a = await newAccount(ALICE, "A", 0);
    const b = await newAccount(ALICE, "B", 0);
    await expect(
      as(ALICE, () =>
        db.transaction(async (tx) => {
          const t = await tx.query<{ id: string }>(`insert into transfers (from_account_id, to_account_id, amount_cents, occurred_on) values ($1, $2, 500, '2026-10-02') returning id`, [a, b]);
          await tx.query(`insert into account_entries (account_id, kind, status, amount_cents, occurred_on, transfer_id) values ($1, 'transfer', 'confirmed', -500, '2026-10-02', $2)`, [a, t.rows[0].id]);
        }),
      ),
    ).rejects.toThrow(/inconsistente/);
    expect(await balance(ALICE, a)).toBe(0);
  });

  it("apagar só um lado é rejeitado", async () => {
    const a = await newAccount(ALICE, "A2", 0);
    const b = await newAccount(ALICE, "B2", 0);
    await as(ALICE, () => q(`select create_transfer($1, $2, 700, '2026-10-02')`, [a, b]));
    await expect(as(ALICE, () => q(`delete from account_entries where account_id = $1`, [a]))).rejects.toThrow(/inconsistente/);
    // apagar a transferência inteira funciona (cascata nos dois lados)
    await as(ALICE, () => q(`delete from transfers where from_account_id = $1`, [a]));
    expect(await balance(ALICE, a)).toBe(0);
    expect(await balance(ALICE, b)).toBe(0);
  });

  it("edição atualiza os dois lados juntos", async () => {
    const a = await newAccount(ALICE, "A3", 1000);
    const b = await newAccount(ALICE, "B3", 0);
    const { id } = await as(ALICE, () => one<{ id: string }>(`select create_transfer($1, $2, 300, '2026-10-02') as id`, [a, b]));
    await as(ALICE, () => q(`select update_transfer($1, 450, '2026-10-03', 'confirmed', 'ajustada')`, [id]));
    expect(await balance(ALICE, a)).toBe(550);
    expect(await balance(ALICE, b)).toBe(450);
  });

  it("idempotência: repetir a mesma requisição não duplica", async () => {
    const a = await newAccount(ALICE, "A4", 1000);
    const b = await newAccount(ALICE, "B4", 0);
    const r1 = await as(ALICE, () => one<{ id: string }>(`select create_transfer($1, $2, 100, '2026-10-02', 'confirmed', null, 'req-123') as id`, [a, b]));
    const r2 = await as(ALICE, () => one<{ id: string }>(`select create_transfer($1, $2, 100, '2026-10-02', 'confirmed', null, 'req-123') as id`, [a, b]));
    expect(r1.id).toBe(r2.id);
    expect(await balance(ALICE, a)).toBe(900);
  });

  it("não transfere para a mesma conta", async () => {
    const a = await newAccount(ALICE, "A5", 1000);
    await expect(as(ALICE, () => q(`select create_transfer($1, $1, 100, '2026-10-02')`, [a]))).rejects.toThrow();
  });
});

describe("compras no crédito, faturas e estornos (banco)", () => {
  async function setupCard(uid: string) {
    const acc = await newAccount(uid, "Conta pagadora", 100000);
    const card = await as(uid, async () => (await one<{ id: string }>(
      `insert into cards (name, closing_day, due_day, payment_account_id, limit_cents) values ('Nubank', 13, 20, $1, 500000) returning id`, [acc],
    )).id);
    return { acc, card };
  }

  it("[1] compra no crédito não altera o saldo da conta; pagamento sim, e não vira despesa", async () => {
    const { acc, card } = await setupCard(ALICE);
    await as(ALICE, () => q(`select create_credit_purchase($1, 'Booster', null, '2026-10-05', 8500, $2::jsonb)`, [
      card, JSON.stringify([{ number: 1, invoice_ref: "2026-10", amount_cents: 4250 }, { number: 2, invoice_ref: "2026-11", amount_cents: 4250 }]),
    ]));
    expect(await balance(ALICE, acc)).toBe(100000);
    await as(ALICE, () => q(`select pay_invoice($1, '2026-10', $2, 4250, '2026-10-20')`, [card, acc]));
    expect(await balance(ALICE, acc)).toBe(95750);
    const expenses = await as(ALICE, () => q(`select * from account_entries where account_id = $1 and kind = 'expense'`, [acc]));
    expect(expenses).toHaveLength(0);
  });

  it("parcelas que não somam o total são rejeitadas", async () => {
    const { card } = await setupCard(ALICE);
    await expect(as(ALICE, () => q(`select create_credit_purchase($1, 'X', null, '2026-10-05', 8500, $2::jsonb)`, [
      card, JSON.stringify([{ number: 1, invoice_ref: "2026-10", amount_cents: 4250 }, { number: 2, invoice_ref: "2026-11", amount_cents: 4249 }]),
    ]))).rejects.toThrow(/não somam/);
    await expect(as(ALICE, () => q(`select create_credit_purchase($1, 'X', null, '2026-10-05', 8500, $2::jsonb)`, [
      card, JSON.stringify([{ number: 1, invoice_ref: "2026-10", amount_cents: 4250 }, { number: 2, invoice_ref: "2026-12", amount_cents: 4250 }]),
    ]))).rejects.toThrow(/inválida/);
  });

  it("compra parcelada atravessando o ano grava as faturas certas", async () => {
    const { card } = await setupCard(ALICE);
    const pid = (await as(ALICE, () => one<{ id: string }>(`select create_credit_purchase($1, 'Carta', null, '2026-11-20', 30000, $2::jsonb) as id`, [
      card, JSON.stringify([1, 2, 3].map((n, i) => ({ number: n, invoice_ref: ["2026-12", "2027-01", "2027-02"][i], amount_cents: 10000 }))),
    ]))).id;
    const refs = await as(ALICE, () => q<{ invoice_ref: string }>(`select invoice_ref from card_charges where purchase_id = $1 order by installment_number`, [pid]));
    expect(refs.map((r) => r.invoice_ref)).toEqual(["2026-12", "2027-01", "2027-02"]);
  });

  it("[10] estorno total zera o líquido e marca a compra", async () => {
    const { card } = await setupCard(ALICE);
    const pid = (await as(ALICE, () => one<{ id: string }>(`select create_credit_purchase($1, 'Produto lacrado', null, '2026-10-05', 20000, $2::jsonb) as id`, [
      card, JSON.stringify([{ number: 1, invoice_ref: "2026-10", amount_cents: 20000 }]),
    ]))).id;
    await as(ALICE, () => q(`select refund_purchase($1, 20000, '2026-10-07', '2026-10')`, [pid]));
    const r = await as(ALICE, () => one<{ s: string; status: string }>(
      `select (select sum(amount_cents) from card_charges where purchase_id = $1 and cancelled_at is null) s, status from purchases where id = $1`, [pid]));
    expect(Number(r.s)).toBe(0);
    expect(r.status).toBe("refunded");
    await expect(as(ALICE, () => q(`select refund_purchase($1, 1, '2026-10-07', '2026-10')`, [pid]))).rejects.toThrow(/maior/);
  });

  it("checks de sinal e dados sensíveis", async () => {
    const acc = await newAccount(ALICE, "S", 0);
    await expect(as(ALICE, () => q(`insert into account_entries (account_id, kind, status, amount_cents, occurred_on) values ($1, 'expense', 'confirmed', 100, '2026-10-02')`, [acc]))).rejects.toThrow(/check/);
    await expect(as(ALICE, () => q(`insert into cards (name, closing_day, due_day, last_four) values ('x', 1, 10, '12345')`))).rejects.toThrow();
    await expect(as(ALICE, () => q(`insert into cards (name, closing_day, due_day) values ('x', 32, 10)`))).rejects.toThrow(/check/);
  });
});

describe("[6] assinaturas idempotentes (banco)", () => {
  it("registrar o mesmo período duas vezes não duplica a cobrança", async () => {
    const acc = await newAccount(ALICE, "Conta assinatura", 10000);
    const sub = await as(ALICE, async () => (await one<{ id: string }>(
      `insert into subscriptions (name, start_date, pay_with, account_id) values ('Claude', '2026-10-05', 'account', $1) returning id`, [acc],
    )).id);
    const r1 = await as(ALICE, () => one<{ r: { created: boolean } }>(`select record_subscription_charge($1, '2026-10', '2026-10-05', 11000, null, 'confirmed') r`, [sub]));
    const r2 = await as(ALICE, () => one<{ r: { created: boolean } }>(`select record_subscription_charge($1, '2026-10', '2026-10-06', 11000, null, 'confirmed') r`, [sub]));
    expect(r1.r.created).toBe(true);
    expect(r2.r.created).toBe(false);
    expect(await balance(ALICE, acc)).toBe(-1000);
  });
});

describe("dados de demonstração", () => {
  it("carrega separado dos dados reais e pode ser removido", async () => {
    await as(BOB, () => q(`select load_demo_data('Minha conta', 'Nubank', '2026-10-08')`));
    const demo = await as(BOB, () => q(`select * from accounts where is_demo`));
    expect(demo).toHaveLength(1);
    await expect(as(BOB, () => q(`select load_demo_data('Minha conta', 'Nubank', '2026-10-08')`))).rejects.toThrow(/já estão/);
    await as(BOB, () => q(`select clear_demo_data()`));
    expect(await as(BOB, () => q(`select * from accounts where is_demo`))).toHaveLength(0);
    expect(await as(BOB, () => q(`select * from card_charges`))).toHaveLength(0);
  });

  it("exportação contém apenas dados do próprio usuário", async () => {
    const exp = await as(BOB, () => one<{ d: { accounts: { user_id: string }[] } }>(`select export_my_data() d`));
    expect(exp.d.accounts.every((a) => a.user_id === BOB)).toBe(true);
  });
});

describe("[17] persistência após logout e novo login", () => {
  it("dados continuam lá ao abrir uma nova sessão do mesmo usuário", async () => {
    const id = await newAccount(ALICE, "Persistente", 4242);
    // "logout": nova sessão sem identidade não vê nada
    await expect(as(null, () => q(`select * from accounts`))).rejects.toThrow();
    // "login" novamente
    expect(await balance(ALICE, id)).toBe(4242);
  });

  it("[18] preferência de tema persiste no perfil", async () => {
    await as(ALICE, () => q(`update profiles set theme = 'light'`));
    expect((await as(ALICE, () => one<{ theme: string }>(`select theme from profiles`))).theme).toBe("light");
    await expect(as(ALICE, () => q(`update profiles set theme = 'neon'`))).rejects.toThrow(/check/);
  });
});

describe("conta excluída", () => {
  it("apagar o usuário remove todos os seus dados (cascata)", async () => {
    const tmp = "33333333-3333-4333-8333-333333333333";
    await db.query(`insert into auth.users (id, email) values ($1, 'tmp@nexo.test')`, [tmp]);
    await newAccount(tmp, "Temp", 1);
    await db.query(`delete from auth.users where id = $1`, [tmp]);
    const left = await q(`select (select count(*) from accounts where user_id = $1) + (select count(*) from categories where user_id = $1) + (select count(*) from profiles where id = $1) as n`, [tmp]);
    expect(Number((left[0] as { n: string }).n)).toBe(0);
  });
});
