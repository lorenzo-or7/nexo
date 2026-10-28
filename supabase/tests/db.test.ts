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

describe("cartões: excluir ou arquivar", () => {
  it("cartão sem movimentos é excluído; com histórico é arquivado", async () => {
    const acc = await newAccount(ALICE, "Conta cartões", 0);
    const [empty, used] = await as(ALICE, async () => {
      const a = await one<{ id: string }>(`insert into cards (name, closing_day, due_day, payment_account_id, institution_key) values ('Vazio', 3, 10, $1, 'nubank') returning id`, [acc]);
      const b = await one<{ id: string }>(`insert into cards (name, closing_day, due_day, payment_account_id) values ('Usado', 3, 10, $1) returning id`, [acc]);
      return [a.id, b.id];
    });
    await as(ALICE, () => q(`select create_credit_purchase($1, 'Algo', null, '2026-10-01', 1000, $2::jsonb)`, [used, JSON.stringify([{ number: 1, invoice_ref: "2026-10", amount_cents: 1000 }])]));

    expect((await as(ALICE, () => one<{ r: string }>(`select remove_card($1) r`, [empty]))).r).toBe("deleted");
    expect((await as(ALICE, () => one<{ r: string }>(`select remove_card($1) r`, [used]))).r).toBe("archived");
    expect(await as(ALICE, () => q(`select 1 from cards where id = $1`, [empty]))).toHaveLength(0);
    const kept = await as(ALICE, () => one<{ archived_at: string | null }>(`select archived_at from cards where id = $1`, [used]));
    expect(kept.archived_at).not.toBeNull();
    expect(await as(ALICE, () => q(`select 1 from card_charges where card_id = $1`, [used]))).toHaveLength(1);
  });

  it("não remove cartão de outro usuário", async () => {
    const card = await as(ALICE, async () => (await one<{ id: string }>(`insert into cards (name, closing_day, due_day) values ('Da Alice', 3, 10) returning id`)).id);
    await expect(as(BOB, () => q(`select remove_card($1)`, [card]))).rejects.toThrow(/não encontrado/);
    expect(await as(ALICE, () => q(`select 1 from cards where id = $1`, [card]))).toHaveLength(1);
  });

  it("valida a chave da instituição", async () => {
    await expect(as(ALICE, () => q(`insert into cards (name, closing_day, due_day, institution_key) values ('x', 3, 10, 'Nu Bank!')`))).rejects.toThrow(/check/);
  });
});

describe("perfil garantido", () => {
  it("ensure_profile cria perfil e categorias para quem ficou sem", async () => {
    const orphan = "44444444-4444-4444-8444-444444444444";
    await db.exec("alter table auth.users disable trigger on_auth_user_created");
    await db.query(`insert into auth.users (id, email) values ($1, 'orfao@nexo.test')`, [orphan]);
    await db.exec("alter table auth.users enable trigger on_auth_user_created");
    expect(await as(orphan, () => q(`select 1 from profiles`))).toHaveLength(0);
    await as(orphan, () => q(`select ensure_profile()`));
    await as(orphan, () => q(`select ensure_profile()`)); // idempotente
    const p = await as(orphan, () => one<{ display_name: string }>(`select display_name from profiles`));
    expect(p.display_name).toBe("orfao");
    const n = await as(orphan, () => one<{ n: number }>(`select count(*)::int n from categories where parent_id is null`));
    expect(n.n).toBe(5);
  });
});

describe("Etapa 2: contas e lançamentos", () => {
  it("conta sem lançamentos é excluída; com histórico é arquivada", async () => {
    const empty = await newAccount(ALICE, "Vazia E2", 0);
    const used = await newAccount(ALICE, "Usada E2", 1000);
    await as(ALICE, () => q(`insert into account_entries (account_id, kind, status, amount_cents, occurred_on) values ($1, 'expense', 'confirmed', -100, '2026-10-02')`, [used]));
    expect((await as(ALICE, () => one<{ r: string }>(`select remove_account($1) r`, [empty]))).r).toBe("deleted");
    expect((await as(ALICE, () => one<{ r: string }>(`select remove_account($1) r`, [used]))).r).toBe("archived");
    await expect(as(BOB, () => q(`select remove_account($1)`, [used]))).rejects.toThrow(/não encontrada/);
  });

  it("excluir lançamento é controlado (some do saldo, fica na auditoria)", async () => {
    const acc = await newAccount(ALICE, "Exclusão", 1000);
    const { id } = await as(ALICE, () => one<{ id: string }>(`insert into account_entries (account_id, kind, status, amount_cents, occurred_on) values ($1, 'expense', 'confirmed', -300, '2026-10-02') returning id`, [acc]));
    expect(await balance(ALICE, acc)).toBe(700);
    await as(ALICE, () => q(`select delete_entry($1)`, [id]));
    expect(await balance(ALICE, acc)).toBe(1000);
    const audit = await as(ALICE, () => q(`select 1 from audit_log where row_id = $1 and action = 'update'`, [id]));
    expect(audit.length).toBeGreaterThan(0);
    await expect(as(ALICE, () => q(`select delete_entry($1)`, [id]))).rejects.toThrow(/não encontrado/);
  });

  it("excluir um lado da transferência apaga os dois", async () => {
    const a = await newAccount(ALICE, "TA", 1000);
    const b = await newAccount(ALICE, "TB", 0);
    await as(ALICE, () => q(`select create_transfer($1, $2, 400, '2026-10-02')`, [a, b]));
    const side = await as(ALICE, () => one<{ id: string }>(`select id from account_entries where account_id = $1`, [b]));
    await as(ALICE, () => q(`select delete_entry($1)`, [side.id]));
    expect(await balance(ALICE, a)).toBe(1000);
    expect(await balance(ALICE, b)).toBe(0);
  });

  it("edit_transfer troca contas e valor mantendo o consolidado", async () => {
    const a = await newAccount(ALICE, "EA", 1000);
    const b = await newAccount(ALICE, "EB", 0);
    const c = await newAccount(ALICE, "EC", 0);
    const { id } = await as(ALICE, () => one<{ id: string }>(`select create_transfer($1, $2, 400, '2026-10-02') as id`, [a, b]));
    await as(ALICE, () => q(`select edit_transfer($1, $2, $3, 250, '2026-10-03', 'confirmed', 'ajuste')`, [id, a, c]));
    expect(await balance(ALICE, a)).toBe(750);
    expect(await balance(ALICE, b)).toBe(0);
    expect(await balance(ALICE, c)).toBe(250);
    await expect(as(ALICE, () => q(`select edit_transfer($1, $2, $3, 250, '2026-10-03', 'confirmed', null, 1)`, [id, a, c]))).rejects.toThrow(/outra sessão/);
  });

  it("confirm_entry marca como realizado e passa a contar no saldo", async () => {
    const acc = await newAccount(ALICE, "Confirma", 0);
    const { id } = await as(ALICE, () => one<{ id: string }>(`insert into account_entries (account_id, kind, status, amount_cents, occurred_on) values ($1, 'income', 'expected', 5000, '2026-10-20') returning id`, [acc]));
    expect(await balance(ALICE, acc)).toBe(0);
    await as(ALICE, () => q(`select confirm_entry($1, '2026-10-09')`, [id]));
    expect(await balance(ALICE, acc)).toBe(5000);
  });

  it("tags: cria, substitui e não duplica", async () => {
    const acc = await newAccount(ALICE, "Tags", 0);
    const { id } = await as(ALICE, () => one<{ id: string }>(`insert into account_entries (account_id, kind, status, amount_cents, occurred_on) values ($1, 'expense', 'confirmed', -100, '2026-10-02') returning id`, [acc]));
    await as(ALICE, () => q(`select set_entry_tags($1, $2)`, [id, ["viagem", " lazer ", "viagem"]]));
    await as(ALICE, () => q(`select set_entry_tags($1, $2)`, [id, ["lazer", "pokémon"]]));
    const tags = await as(ALICE, () => q<{ name: string }>(`select t.name from entry_tags et join tags t on t.id = et.tag_id where et.entry_id = $1 order by t.name`, [id]));
    expect(tags.map((t) => t.name)).toEqual(["lazer", "pokémon"]);
  });
});

describe("excluir compra no cartão", () => {
  it("cancela as parcelas e tira a compra das faturas", async () => {
    const card = await as(ALICE, async () => (await one<{ id: string }>(`insert into cards (name, closing_day, due_day) values ('Del', 13, 20) returning id`)).id);
    const pid = (await as(ALICE, () => one<{ id: string }>(`select create_credit_purchase($1, 'X', null, '2026-10-05', 3000, $2::jsonb) as id`, [
      card, JSON.stringify([1, 2, 3].map((n, i) => ({ number: n, invoice_ref: ["2026-10", "2026-11", "2026-12"][i], amount_cents: 1000 }))),
    ]))).id;
    await as(ALICE, () => q(`select delete_purchase($1)`, [pid]));
    const live = await as(ALICE, () => q(`select 1 from card_charges where purchase_id = $1 and cancelled_at is null`, [pid]));
    expect(live).toHaveLength(0);
    await expect(as(ALICE, () => q(`select delete_purchase($1)`, [pid]))).rejects.toThrow(/não encontrada/);
    await expect(as(BOB, () => q(`select delete_purchase($1)`, [pid]))).rejects.toThrow(/não encontrada/);
  });
});

describe("reembolsos de terceiros", () => {
  async function setup() {
    const acc = await newAccount(ALICE, `Reemb ${Math.random()}`, 0);
    const card = await as(ALICE, async () => (await one<{ id: string }>(`insert into cards (name, closing_day, due_day, payment_account_id) values ('R', 13, 20, $1) returning id`, [acc])).id);
    const pid = (await as(ALICE, () => one<{ id: string }>(`select create_credit_purchase($1, 'Jantar', null, '2026-10-05', 12000, $2::jsonb) as id`, [
      card, JSON.stringify([{ number: 1, invoice_ref: "2026-10", amount_cents: 12000 }]),
    ]))).id;
    return { acc, pid };
  }

  it("compra no crédito com parte paga por outra pessoa", async () => {
    const { acc, pid } = await setup();
    await as(ALICE, () => q(`select add_reimbursement($1, null, $2, 4000, '2026-10-19', 'Ana')`, [pid, acc]));
    await as(ALICE, () => q(`select add_reimbursement($1, null, $2, 4000, '2026-10-19', 'Bruno')`, [pid, acc]));
    // a receber, ainda não no saldo
    expect(await balance(ALICE, acc)).toBe(0);
    const rows = await as(ALICE, () => q<{ counterparty: string; status: string; kind: string }>(`select counterparty, status, kind from account_entries where purchase_id = $1 order by counterparty`, [pid]));
    expect(rows).toEqual([{ counterparty: "Ana", status: "scheduled", kind: "refund" }, { counterparty: "Bruno", status: "scheduled", kind: "refund" }]);
    // passar do total é recusado
    await expect(as(ALICE, () => q(`select add_reimbursement($1, null, $2, 4001, '2026-10-19', 'Caio')`, [pid, acc]))).rejects.toThrow(/passa do valor/);
    // recebeu: entra no saldo
    const ana = await as(ALICE, () => one<{ id: string }>(`select id from account_entries where purchase_id = $1 and counterparty = 'Ana'`, [pid]));
    await as(ALICE, () => q(`select confirm_entry($1, '2026-10-18')`, [ana.id]));
    expect(await balance(ALICE, acc)).toBe(4000);
  });

  it("despesa em conta com reembolso; excluir a despesa tira o pendente", async () => {
    const acc = await newAccount(ALICE, "Reemb conta", 10000);
    const { id } = await as(ALICE, () => one<{ id: string }>(`insert into account_entries (account_id, kind, status, amount_cents, occurred_on) values ($1, 'expense', 'confirmed', -6000, '2026-10-02') returning id`, [acc]));
    await as(ALICE, () => q(`select add_reimbursement(null, $1, $2, 3000, '2026-10-10', 'Ana')`, [id, acc]));
    await as(ALICE, () => q(`select delete_entry($1)`, [id]));
    const live = await as(ALICE, () => q(`select 1 from account_entries where reimburses_entry_id = $1 and deleted_at is null`, [id]));
    expect(live).toHaveLength(0);
  });

  it("excluir a compra tira os reembolsos pendentes, mas mantém os recebidos", async () => {
    const { acc, pid } = await setup();
    await as(ALICE, () => q(`select add_reimbursement($1, null, $2, 1000, '2026-10-19', 'Ana')`, [pid, acc]));
    await as(ALICE, () => q(`select add_reimbursement($1, null, $2, 2000, '2026-10-19', 'Bia', 'confirmed')`, [pid, acc]));
    await as(ALICE, () => q(`select delete_purchase($1)`, [pid]));
    const live = await as(ALICE, () => q<{ counterparty: string }>(`select counterparty from account_entries where purchase_id = $1 and deleted_at is null`, [pid]));
    expect(live.map((r) => r.counterparty)).toEqual(["Bia"]);
  });

  it("não aceita reembolso de compra de outro usuário", async () => {
    const { pid } = await setup();
    const bobAcc = await newAccount(BOB, "Bob reemb", 0);
    await expect(as(BOB, () => q(`select add_reimbursement($1, null, $2, 100, '2026-10-19', 'X')`, [pid, bobAcc]))).rejects.toThrow(/não encontrada/);
  });
});

describe("categorias do usuário", () => {
  const cat = (uid: string, name: string, kind = "expense", parent: string | null = null) =>
    as(uid, async () => (await one<{ id: string }>(`insert into categories (name, kind, parent_id) values ($1, $2, $3) returning id`, [name, kind, parent])).id);

  it("cria categoria e subcategoria; nome repetido no mesmo nível é recusado", async () => {
    const pets = await cat(ALICE, "Pets");
    await cat(ALICE, "Ração", "expense", pets);
    await expect(cat(ALICE, "Ração", "expense", pets)).rejects.toThrow(/duplicate|unique/i);
    // mesmo nome em outro nível pode
    await cat(ALICE, "Ração");
    // outro usuário não enxerga nem usa como principal
    const seen = await as(BOB, () => q(`select 1 from categories where id = $1`, [pets]));
    expect(seen).toHaveLength(0);
    await expect(cat(BOB, "Intrusa", "expense", pets)).rejects.toThrow();
  });

  it("no máximo dois níveis e mesmo tipo da principal", async () => {
    const casa = await cat(ALICE, "Casa nova");
    const moveis = await cat(ALICE, "Móveis", "expense", casa);
    await expect(cat(ALICE, "Sofá", "expense", moveis)).rejects.toThrow(/não pode ter subcategorias/);
    await expect(cat(ALICE, "Aluguel recebido", "income", casa)).rejects.toThrow(/mesmo tipo/);
    // principal com filhas não pode virar subcategoria
    const outra = await cat(ALICE, "Outra principal");
    await expect(as(ALICE, () => q(`update categories set parent_id = $1 where id = $2`, [outra, casa]))).rejects.toThrow(/tem subcategorias/);
  });

  it("mudar o tipo da principal leva as subcategorias junto", async () => {
    const extra = await cat(ALICE, "Extras");
    const sub = await cat(ALICE, "Bicos", "expense", extra);
    await as(ALICE, () => q(`update categories set kind = 'income' where id = $1`, [extra]));
    const r = await as(ALICE, () => one<{ kind: string }>(`select kind from categories where id = $1`, [sub]));
    expect(r.kind).toBe("income");
  });

  it("sem uso é excluída; em uso é arquivada com as subcategorias", async () => {
    const vazia = await cat(ALICE, "Vazia");
    await cat(ALICE, "Filha vazia", "expense", vazia);
    expect((await as(ALICE, () => one<{ r: string }>(`select remove_category($1) as r`, [vazia]))).r).toBe("deleted");
    expect(await as(ALICE, () => q(`select 1 from categories where id = $1 or parent_id = $1`, [vazia]))).toHaveLength(0);

    const usada = await cat(ALICE, "Usada");
    const filha = await cat(ALICE, "Filha usada", "expense", usada);
    const acc = await newAccount(ALICE, "Cat conta", 1000);
    await as(ALICE, () => q(`insert into account_entries (account_id, kind, status, amount_cents, occurred_on, category_id) values ($1, 'expense', 'confirmed', -100, '2026-10-02', $2)`, [acc, filha]));
    expect((await as(ALICE, () => one<{ r: string }>(`select remove_category($1) as r`, [usada]))).r).toBe("archived");
    const rows = await as(ALICE, () => q<{ archived: boolean }>(`select archived_at is not null as archived from categories where id in ($1, $2)`, [usada, filha]));
    expect(rows.every((r) => r.archived)).toBe(true);
    // o lançamento continua com a categoria
    const e = await as(ALICE, () => one<{ category_id: string }>(`select category_id from account_entries where account_id = $1`, [acc]));
    expect(e.category_id).toBe(filha);
    await expect(as(BOB, () => q(`select remove_category($1)`, [usada]))).rejects.toThrow(/não encontrada/);
  });
});

describe("assinaturas: salvar, cobrar e excluir", () => {
  const save = (uid: string, id: string | null, amount: number, start: string, acc: string, from: string | null = null) =>
    as(uid, async () => (await one<{ id: string }>(
      `select save_subscription($1, 'Streaming', null, 'monthly', 1::smallint, $2::date, 'account', null, $3, $4, $5::date) as id`,
      [id, start, acc, amount, from],
    )).id);

  it("cria com preço; editar muda o preço a partir da data", async () => {
    const acc = await newAccount(ALICE, "Assin conta", 10000);
    const id = await save(ALICE, null, 3990, "2026-10-15", acc);
    expect(await as(ALICE, () => q(`select amount_cents::int as a from subscription_prices where subscription_id = $1`, [id]))).toEqual([{ a: 3990 }]);
    await save(ALICE, id, 4490, "2026-10-15", acc, "2026-11-15");
    const prices = await as(ALICE, () => q<{ f: string; a: number }>(`select effective_from::text as f, amount_cents::int as a from subscription_prices where subscription_id = $1 order by 1`, [id]));
    expect(prices).toEqual([{ f: "2026-10-15", a: 3990 }, { f: "2026-11-15", a: 4490 }]);
    await expect(save(ALICE, id, 0, "2026-10-15", acc)).rejects.toThrow(/Valor inválido/);
    await expect(save(BOB, id, 100, "2026-10-15", acc)).rejects.toThrow();
  });

  it("cobrança vira lançamento uma vez só; excluir com cobrança cancela", async () => {
    const acc = await newAccount(ALICE, "Assin conta 2", 10000);
    const id = await save(ALICE, null, 2000, "2026-10-01", acc);
    for (let i = 0; i < 2; i++) await as(ALICE, () => q(`select record_subscription_charge($1, '2026-10', '2026-10-01', 2000, null, 'confirmed')`, [id]));
    expect(await balance(ALICE, acc)).toBe(8000);
    expect((await as(ALICE, () => one<{ r: string }>(`select remove_subscription($1, '2026-10-10') as r`, [id]))).r).toBe("cancelled");
    const s = await as(ALICE, () => one<{ status: string; c: string }>(`select status, cancelled_at::text as c from subscriptions where id = $1`, [id]));
    expect(s).toEqual({ status: "cancelled", c: "2026-10-10" });
    // o lançamento continua
    expect(await balance(ALICE, acc)).toBe(8000);

    const vazia = await save(ALICE, null, 500, "2026-12-01", acc);
    expect((await as(ALICE, () => one<{ r: string }>(`select remove_subscription($1, '2026-10-10') as r`, [vazia]))).r).toBe("deleted");
  });
});

describe("renda fixa", () => {
  it("lança o mês uma única vez, acompanha edições e isola usuários", async () => {
    const acc = await newAccount(ALICE, "Conta renda fixa");
    const fid = await as(ALICE, async () => (await one<{ id: string }>(
      `select save_fixed_income(null, 'client', 'Mensalidade Namba', 'Namba', 150000, 5::smallint, '2026-10-05', null, $1, null, null) as id`,
      [acc],
    )).id);

    const first = await as(ALICE, () => one<{ r: { created: boolean } }>(`select record_fixed_income_entry($1, '2026-10', '2026-10-05') as r`, [fid]));
    const again = await as(ALICE, () => one<{ r: { created: boolean } }>(`select record_fixed_income_entry($1, '2026-10', '2026-10-05') as r`, [fid]));
    expect(first.r.created).toBe(true);
    expect(again.r.created).toBe(false);

    // previsto não entra no saldo real
    expect(await balance(ALICE, acc)).toBe(0);

    // editar valor/dia atualiza o lançamento ainda previsto
    await as(ALICE, () => q(`select save_fixed_income($1, 'client', 'Mensalidade Namba', 'Namba', 180000, 31::smallint, '2026-10-05', null, $2, null, null)`, [fid, acc]));
    const e = await as(ALICE, () => one<{ amount_cents: string; occurred_on: string; status: string }>(
      `select amount_cents, to_char(occurred_on, 'YYYY-MM-DD') as occurred_on, status from account_entries where fixed_income_id = $1`, [fid]));
    expect(Number(e.amount_cents)).toBe(180000);
    expect(e.occurred_on).toBe("2026-10-31");

    // realizado entra no saldo e deixa de acompanhar edições
    const entryId = (await as(ALICE, () => one<{ id: string }>(`select id from account_entries where fixed_income_id = $1`, [fid]))).id;
    await as(ALICE, () => q(`select confirm_entry($1, '2026-10-06')`, [entryId]));
    expect(await balance(ALICE, acc)).toBe(180000);
    await as(ALICE, () => q(`select save_fixed_income($1, 'client', 'Mensalidade Namba', 'Namba', 200000, 5::smallint, '2026-10-05', null, $2, null, null)`, [fid, acc]));
    expect(await balance(ALICE, acc)).toBe(180000);

    // dia 31 em fevereiro cai no último dia do mês
    const feb = await one<{ d: string }>(`select to_char(fixed_income_date('2027-02', 31), 'YYYY-MM-DD') as d`);
    expect(feb.d).toBe("2027-02-28");

    // outro usuário não enxerga nem lança
    expect(await as(BOB, () => q(`select 1 from fixed_incomes`))).toHaveLength(0);
    await expect(as(BOB, () => q(`select record_fixed_income_entry($1, '2026-11', '2026-11-05')`, [fid]))).rejects.toThrow();

    // com recebimento CONFIRMADO, excluir some da lista mas preserva o dinheiro que entrou
    const res = await as(ALICE, () => one<{ r: string }>(`select remove_fixed_income($1, '2026-10-20') as r`, [fid]));
    expect(res.r).toBe("deleted_with_history");
    expect(await as(ALICE, () => q(`select 1 from fixed_incomes where id = $1 and deleted_at is null`, [fid]))).toHaveLength(0);
    expect(await balance(ALICE, acc)).toBe(180000); // o dinheiro que já entrou continua no extrato
    // conta com renda fixa só arquiva
    const rm = await as(ALICE, () => one<{ r: string }>(`select remove_account($1) as r`, [acc]));
    expect(rm.r).toBe("archived");
  });

  it("excluir uma renda só com lançamentos PREVISTOS apaga tudo (bug: virava 'encerrada' e ficava na lista)", async () => {
    const acc = await newAccount(ALICE, "Conta exclusão renda");
    const fid = await as(ALICE, async () => (await one<{ id: string }>(
      `select save_fixed_income(null, 'salary', 'Salário teste', null, 160000, 4::smallint, '2026-08-04', null, $1, null, null) as id`, [acc])).id);
    // o sistema cria sozinho os meses vencidos como PREVISTOS
    for (const [p, d] of [["2026-08", "2026-08-04"], ["2026-09", "2026-09-04"], ["2026-10", "2026-10-04"]]) {
      await as(ALICE, () => q(`select record_fixed_income_entry($1, $2, $3)`, [fid, p, d]));
    }
    expect(await as(ALICE, () => q(`select 1 from account_entries where fixed_income_id = $1`, [fid]))).toHaveLength(3);

    const res = await as(ALICE, () => one<{ r: string }>(`select remove_fixed_income($1, '2026-10-20') as r`, [fid]));
    expect(res.r).toBe("deleted");
    // a renda e todos os seus lançamentos sumiram: nada órfão, nada na lista
    expect(await as(ALICE, () => q(`select 1 from fixed_incomes where id = $1`, [fid]))).toHaveLength(0);
    expect(await as(ALICE, () => q(`select 1 from account_entries where fixed_income_id = $1`, [fid]))).toHaveLength(0);
    expect(await as(ALICE, () => q(`select 1 from account_entries where description = 'Salário teste'`))).toHaveLength(0);
    expect(await balance(ALICE, acc)).toBe(0);
    // não dá para excluir de novo nem lançar mês para ela
    await expect(as(ALICE, () => q(`select remove_fixed_income($1, '2026-10-20')`, [fid]))).rejects.toThrow(/não encontrada/);
    await expect(as(ALICE, () => q(`select record_fixed_income_entry($1, '2026-11', '2026-11-04')`, [fid]))).rejects.toThrow(/não encontrada/);
  });

  it("encerrar × excluir: encerrada guarda histórico e não gera mais; excluída com histórico fica oculta e não volta", async () => {
    const acc = await newAccount(ALICE, "Conta encerrar renda");
    const fid = await as(ALICE, async () => (await one<{ id: string }>(
      `select save_fixed_income(null, 'client', 'Cliente X', 'X', 90000, 10::smallint, '2026-08-10', null, $1, null, null) as id`, [acc])).id);
    const ids: string[] = [];
    for (const [p, d] of [["2026-08", "2026-08-10"], ["2026-09", "2026-09-10"]]) {
      const r = await as(ALICE, () => one<{ r: { id: string } }>(`select record_fixed_income_entry($1, $2, $3) as r`, [fid, p, d]));
      ids.push(r.r.id);
    }
    await as(ALICE, () => q(`select confirm_entry($1, '2026-08-10')`, [ids[0]])); // agosto: dinheiro entrou; setembro: só previsto

    // previsão de mês futuro criada à mão (ex.: lançamento adiantado) some ao encerrar; o confirmado e o vencido ficam
    await as(ALICE, () => q(`select record_fixed_income_entry($1, '2026-11', '2026-11-10')`, [fid]));
    const ended = await as(ALICE, () => one<{ r: string }>(`select end_fixed_income($1, '2026-10-16') as r`, [fid]));
    expect(ended.r).toBe("ended");
    const f = await as(ALICE, () => one<{ status: string; deleted_at: string | null; end_date: string }>(`select status, deleted_at, to_char(end_date,'YYYY-MM-DD') as end_date from fixed_incomes where id = $1`, [fid]));
    expect(f.status).toBe("ended");
    expect(f.deleted_at).toBeNull(); // encerrada continua consultável
    expect(f.end_date).toBe("2026-10-16");
    const left = await as(ALICE, () => q<{ fixed_income_period: string }>(`select fixed_income_period from account_entries where fixed_income_id = $1 order by 1`, [fid]));
    expect(left.map((x) => x.fixed_income_period)).toEqual(["2026-08", "2026-09"]);
    // encerrada não recebe mês novo
    const noNew = await as(ALICE, () => one<{ r: { created: boolean } }>(`select record_fixed_income_entry($1, '2026-10', '2026-10-10') as r`, [fid]));
    expect(noNew.r.created).toBe(false);

    // excluir: o previsto de setembro some; o confirmado de agosto fica no extrato; a renda sai da lista
    const del = await as(ALICE, () => one<{ r: string }>(`select remove_fixed_income($1, '2026-10-16') as r`, [fid]));
    expect(del.r).toBe("deleted_with_history");
    expect(await as(ALICE, () => q(`select 1 from fixed_incomes where id = $1 and deleted_at is null`, [fid]))).toHaveLength(0);
    const kept = await as(ALICE, () => q<{ status: string }>(`select status from account_entries where fixed_income_id = $1 and deleted_at is null`, [fid]));
    expect(kept.map((k) => k.status)).toEqual(["confirmed"]);
    expect(await balance(ALICE, acc)).toBe(90000);
    // e outro usuário não consegue encerrar nem excluir
    await expect(as(BOB, () => q(`select end_fixed_income($1, '2026-10-16')`, [fid]))).rejects.toThrow();
  });

  it("sem histórico, remover apaga", async () => {
    const acc = await newAccount(ALICE, "Conta sem lançamentos");
    const fid = await as(ALICE, async () => (await one<{ id: string }>(
      `select save_fixed_income(null, 'salary', 'Salário', null, 500000, 5::smallint, '2026-11-05', null, $1, null, null) as id`, [acc])).id);
    const res = await as(ALICE, () => one<{ r: string }>(`select remove_fixed_income($1, '2026-10-20') as r`, [fid]));
    expect(res.r).toBe("deleted");
  });
});
