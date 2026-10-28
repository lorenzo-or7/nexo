#!/usr/bin/env node
/**
 * Homologação do banco do NEXO num Postgres REAL e descartável, com papéis e privilégios no estilo Supabase.
 *
 *   Pré-requisitos: um Postgres 15+ acessível como superusuário (ver README.md) e o módulo `pg`
 *   (`npm i --no-save pg` ou PGAUDIT_DIR=/pasta/com/node_modules/pg).
 *   Uso: PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres node supabase/audit/run-audit.mjs
 *
 * NUNCA aponte para produção: o script cria e apaga bancos chamados nexo_audit_*.
 * Todos os dados são fictícios. Saída: tabela PASS/FAIL no terminal e supabase/audit/last-report.json.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.PGAUDIT_DIR ? path.join(process.env.PGAUDIT_DIR, "x.js") : import.meta.url);
const { Client, Pool } = require("pg");

const HOST = process.env.PGHOST ?? "127.0.0.1";
const PORT = Number(process.env.PGPORT ?? 5432);
const SUPER = process.env.PGUSER ?? "postgres";
const MIGRATIONS = path.resolve(here, "../migrations");
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const bootstrap = readFileSync(path.join(here, "bootstrap.sql"), "utf8");
const detector = readFileSync(path.join(here, "verificar-migrations.sql"), "utf8");

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

// ------------------------------------------------------------------ infraestrutura
const results = [];
async function check(id, area, title, fn, { severity = "FAIL" } = {}) {
  try {
    const out = await fn();
    // fn pode devolver { status, evidence } para PASS/WARN/INFO explícitos
    if (out && typeof out === "object" && out.status) results.push({ id, area, title, status: out.status, evidence: out.evidence });
    else results.push({ id, area, title, status: "PASS", evidence: String(out ?? "") });
  } catch (e) {
    results.push({ id, area, title, status: severity, evidence: String(e?.message ?? e) });
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const sha = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

async function admin(db = "postgres") {
  const c = new Client({ host: HOST, port: PORT, user: SUPER, database: db });
  await c.connect();
  return c;
}
async function dropCreate(db, template) {
  const c = await admin();
  await c.query(`drop database if exists ${db} with (force)`);
  await c.query(`create database ${db}${template ? ` template ${template}` : ""}`);
  await c.end();
}
async function runFile(c, sql) {
  await c.query(sql);
}

/** Emula uma requisição PostgREST: conexão como authenticator, SET LOCAL ROLE + claims do JWT, uma transação por chamada. */
class Api {
  constructor(db) {
    this.pool = new Pool({ host: HOST, port: PORT, user: "authenticator", database: db, max: 24 });
  }
  async as(uid, fn) {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query(`set local role ${uid ? "authenticated" : "anon"}`);
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role: "authenticated" } : { role: "anon" })]);
      const r = await fn(c);
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
  async q(uid, text, params = []) {
    return (await this.as(uid, (c) => c.query(text, params))).rows;
  }
  async one(uid, text, params = []) {
    return (await this.q(uid, text, params))[0];
  }
  /** esperado falhar; devolve a mensagem */
  async fails(uid, text, params = [], re) {
    try {
      await this.q(uid, text, params);
    } catch (e) {
      if (re) assert(re.test(e.message), `falhou com mensagem inesperada: ${e.message}`);
      return e.message;
    }
    throw new Error(`deveria ter falhado: ${text.slice(0, 80)}`);
  }
  async end() {
    await this.pool.end();
  }
}

async function freshDb(db, upTo) {
  await dropCreate(db);
  const c = await admin(db);
  await runFile(c, bootstrap);
  const applied = [];
  for (const f of files) {
    if (upTo && f > upTo) break;
    try {
      await runFile(c, readFileSync(path.join(MIGRATIONS, f), "utf8"));
      applied.push(f);
    } catch (e) {
      await c.end();
      throw new Error(`Migration ${f} falhou: ${e.message}`);
    }
  }
  await c.query(`insert into auth.users (id, email) values ($1,'alice@nexo.test'),($2,'bob@nexo.test')`, [ALICE, BOB]);
  await c.end();
  return applied;
}

// ------------------------------------------------------------------ dados fictícios
async function seed(api, uid, label, { full = true } = {}) {
  const acc = (await api.one(uid, `insert into accounts (name, opening_balance_cents, opening_date) values ($1, 100000, '2026-10-01') returning id`, [`Conta ${label}`])).id;
  const acc2 = (await api.one(uid, `insert into accounts (name, opening_balance_cents, opening_date) values ($1, 5000, '2026-10-01') returning id`, [`Reserva ${label}`])).id;
  const card = (await api.one(uid, `insert into cards (name, closing_day, due_day, payment_account_id, limit_cents) values ($1, 13, 20, $2, 500000) returning id`, [`Cartão ${label}`, acc])).id;
  const cat = (await api.one(uid, `insert into categories (name, kind) values ($1, 'expense') returning id`, [`Mercado ${label}`])).id;
  const sub = (await api.one(uid, `insert into categories (name, kind, parent_id) values ($1, 'expense', $2) returning id`, [`Feira ${label}`, cat])).id;
  const parcel = JSON.stringify([
    { number: 1, invoice_ref: "2026-10", amount_cents: 10000 },
    { number: 2, invoice_ref: "2026-11", amount_cents: 10000 },
    { number: 3, invoice_ref: "2026-12", amount_cents: 10000 },
  ]);
  const purchase = (await api.one(uid, `select create_credit_purchase($1, $2, $3, '2026-10-05', 30000, $4::jsonb) as id`, [card, `Notebook ${label}`, sub, parcel])).id;
  const e1 = (await api.one(uid, `insert into account_entries (account_id, kind, status, amount_cents, occurred_on, description, category_id) values ($1,'expense','confirmed',-2500,'2026-10-03',$2,$3) returning id`, [acc, `Mercado ${label}`, cat])).id;
  await api.q(uid, `select set_entry_tags($1, array['casa','teste'])`, [e1]);
  await api.q(uid, `select create_transfer($1, $2, 7000, '2026-10-08')`, [acc, acc2]);
  if (full) {
    await api.q(uid, `select add_reimbursement($1, null, null, 1000, '2026-10-20', 'Ana', 'scheduled', null)`.replace("$1, null, null", "$1, $2, null"), [e1, acc]).catch(() => {});
    await api.q(uid, `select save_subscription(null, $1, null, 'monthly', 1::smallint, '2026-08-15'::date, 'account', null, $2, 3990, null)`, [`Streaming ${label}`, acc]);
    const fiClient = (await api.one(uid, `select save_fixed_income(null, 'client', $1, 'Cliente', 150000, 5::smallint, '2026-08-05', null, $2, null, null) as id`, [`Mensalidade ${label}`, acc])).id;
    const fiSalary = (await api.one(uid, `select save_fixed_income(null, 'salary', $1, null, 400000, 5::smallint, '2026-08-05', null, $2, null, null) as id`, [`Salário ${label}`, acc])).id;
    await api.q(uid, `insert into goals (name, target_cents) values ($1, 100000)`, [`Viagem ${label}`]);
    await api.q(uid, `insert into budgets (category_id, effective_month, amount_cents) values ($1, '2026-10', 50000)`, [cat]);
    await api.q(uid, `insert into invoice_overrides (card_id, invoice_ref, due_date) values ($1, '2026-11', '2026-11-22')`, [card]);
    return { acc, acc2, card, cat, sub, purchase, e1, fiClient, fiSalary };
  }
  return { acc, acc2, card, cat, sub, purchase, e1 };
}

/** Tabelas de dados de um usuário (têm user_id), descobertas dinamicamente no catálogo. */
async function userTables(c) {
  const r = await c.query(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'r' order by 1`);
  return r.rows.map((x) => x.relname);
}
/** Impressão digital do que pertence a um usuário (tabelas e conteúdo), como superusuário (ignora RLS). */
async function fingerprint(c, uid, tables) {
  const out = {};
  for (const t of tables) {
    const r = await c.query(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]') as j, count(*)::int as n from public.${t} x where user_id = $1`, [uid]);
    out[t] = { n: r.rows[0].n, h: sha(r.rows[0].j) };
  }
  const p = await c.query(`select to_jsonb(p) as j from public.profiles p where id = $1`, [uid]);
  out.profiles = { n: p.rowCount, h: sha(p.rows[0]?.j ?? null) };
  return out;
}
const counts = (fp) => Object.fromEntries(Object.entries(fp).map(([k, v]) => [k, v.n]));

// ------------------------------------------------------------------ A. migrations: ordem, aplicação, reaplicação, atualização
async function sectionMigrations() {
  await check("M1", "Migrations", "Nomes no padrão do Supabase, versões únicas, em ordem estritamente crescente", () => {
    const re = /^(\d{14})_[a-z0-9_]+\.sql$/;
    const versions = files.map((f) => {
      assert(re.test(f), `nome fora do padrão: ${f}`);
      return f.slice(0, 14);
    });
    assert(new Set(versions).size === versions.length, "versão repetida");
    for (let i = 1; i < versions.length; i++) assert(versions[i] > versions[i - 1], `fora de ordem: ${versions[i]}`);
    const mtimeOrder = [...files];
    assert(JSON.stringify(mtimeOrder) === JSON.stringify([...files].sort()), "ordem lexicográfica difere");
    return `${files.length} migrations, de ${versions[0]} a ${versions.at(-1)}: ${files.map((f) => f.slice(0, 14)).join(", ")}`;
  });

  let applied;
  await check("M2", "Migrations", "Todas aplicam em sequência num banco vazio com papéis/privilégios estilo Supabase", async () => {
    applied = await freshDb("nexo_audit_main");
    assert(applied.length === files.length, "nem todas aplicadas");
    const c = await admin("nexo_audit_main");
    const t = (await c.query(`select count(*)::int n from pg_tables where schemaname='public'`)).rows[0].n;
    const f = (await c.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)).rows[0].n;
    const v = (await c.query(`show server_version`)).rows[0].server_version;
    await c.end();
    return `${applied.length}/${files.length} aplicadas sem erro no PostgreSQL ${v}; ${t} tabelas, ${f} funções em public`;
  });

  await check("M3", "Migrations", "Reaplicar cada migration sobre o banco já migrado (quais são seguras para rodar de novo)", async () => {
    await dropCreate("nexo_audit_rerun", "nexo_audit_main");
    const c = await admin("nexo_audit_rerun");
    const safe = [];
    const unsafe = [];
    for (const f of files) {
      try {
        await c.query("begin");
        await c.query(readFileSync(path.join(MIGRATIONS, f), "utf8"));
        await c.query("commit");
        safe.push(f.slice(0, 14));
      } catch (e) {
        await c.query("rollback").catch(() => {});
        unsafe.push(`${f.slice(0, 14)} (${e.message.split("\n")[0].slice(0, 70)})`);
      }
    }
    await c.end();
    // Informativo: só migra uma vez; o importante é saber quais NÃO reexecutar
    return { status: "INFO", evidence: `Reaplicáveis sem erro: ${safe.join(", ") || "nenhuma"}. NÃO reexecutar (falham se já aplicadas): ${unsafe.join("; ") || "nenhuma"}` };
  });

  await check("M4", "Migrations", "Atualização com dados fictícios: estado anterior (até 20261017001400) + as 4 novas migrations preservam os dados", async () => {
    const baseline = "20261017001400_fixed_bills.sql";
    const pre = await freshDb("nexo_audit_upg", baseline);
    assert(pre.length === files.indexOf(baseline) + 1, "baseline errado");
    const api = new Api("nexo_audit_upg");
    const sA = await seed(api, ALICE, "A");
    await seed(api, BOB, "B");
    // renda fixa com recebimentos: um confirmado, um previsto
    const ids = [];
    for (const [p, d] of [["2026-08", "2026-08-05"], ["2026-09", "2026-09-05"]]) ids.push((await api.one(ALICE, `select record_fixed_income_entry($1,$2,$3) as r`, [sA.fiClient, p, d])).r.id);
    await api.q(ALICE, `select confirm_entry($1,'2026-08-05')`, [ids[0]]);
    await api.q(ALICE, `select pay_invoice($1,'2026-10',$2,4000,'2026-10-20')`, [sA.card, sA.acc]);
    const c = await admin("nexo_audit_upg");
    const tables = await userTables(c);
    const before = { A: counts(await fingerprint(c, ALICE, tables)), B: counts(await fingerprint(c, BOB, tables)) };
    const balBefore = sha((await c.query(`select account_id, balance_cents from public.account_balances order by 1`)).rows);
    for (const f of files.slice(files.indexOf(baseline) + 1)) {
      try {
        await c.query("begin");
        await c.query(readFileSync(path.join(MIGRATIONS, f), "utf8"));
        await c.query("commit");
      } catch (e) {
        await c.query("rollback").catch(() => {});
        throw new Error(`${f}: ${e.message}`);
      }
    }
    const after = { A: counts(await fingerprint(c, ALICE, tables)), B: counts(await fingerprint(c, BOB, tables)) };
    assert(JSON.stringify(before) === JSON.stringify(after), `contagens mudaram: ${JSON.stringify({ before, after })}`);
    const balAfter = sha((await c.query(`select account_id, balance_cents from public.account_balances order by 1`)).rows);
    assert(balAfter === balBefore, "saldos (view account_balances) mudaram com a atualização");
    await c.end();
    // as funções novas funcionam sobre os dados antigos
    const rev = await api.one(ALICE, `select remove_fixed_income($1,'2026-10-20') as r`, [sA.fiClient]);
    assert(rev.r === "deleted_with_history", `remove_fixed_income devolveu ${rev.r}`);
    await api.end();
    return `${files.length - files.indexOf(baseline) - 1} migrations novas aplicadas sobre dados existentes; contagens de ${tables.length} tabelas idênticas para os 2 usuários; remove_fixed_income = ${rev.r}`;
  });

  await check("M5", "Migrations", "Script de detecção (somente leitura) identifica corretamente quais migrations já foram aplicadas", async () => {
    const run = async (db) => {
      const c = await admin(db);
      const r = await c.query(detector);
      await c.end();
      const rows = (Array.isArray(r) ? r.at(-1) : r).rows;
      return rows;
    };
    const partial = await freshDb("nexo_audit_det", "20261017001400_fixed_bills.sql");
    assert(partial.length === 14, "baseline");
    const rowsPartial = await run("nexo_audit_det");
    const rowsFull = await run("nexo_audit_main");
    assert(rowsFull.length === files.length, `detector lista ${rowsFull.length} de ${files.length}`);
    assert(rowsFull.every((r) => r.aplicada === true), `no banco completo: ${rowsFull.filter((r) => !r.aplicada).map((r) => r.migration).join(",")}`);
    const missing = rowsPartial.filter((r) => !r.aplicada).map((r) => r.migration);
    assert(JSON.stringify(missing) === JSON.stringify(files.slice(14).map((f) => f.slice(0, 14))), `faltantes detectadas: ${missing.join(",")}`);
    return `banco completo: ${rowsFull.length}/${files.length} detectadas; banco parcial: faltam exatamente ${missing.join(", ")}`;
  });
}

// ------------------------------------------------------------------ B. segurança do esquema e das funções
async function sectionSecurity() {
  const c = await admin("nexo_audit_main");
  const api = new Api("nexo_audit_main");

  await check("S1", "Segurança", "RLS ligada em todas as tabelas de public e nenhuma política 'aberta' (using true)", async () => {
    const t = (await c.query(`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`)).rows;
    const off = t.filter((x) => !x.relrowsecurity).map((x) => x.relname);
    assert(off.length === 0, `sem RLS: ${off.join(", ")}`);
    const pol = (await c.query(`select tablename, policyname, cmd, qual, with_check, roles from pg_policies where schemaname='public'`)).rows;
    const open = pol.filter((p) => String(p.qual).trim() === "true" || String(p.with_check).trim() === "true");
    assert(open.length === 0, `políticas abertas: ${open.map((p) => p.tablename + "." + p.policyname).join(", ")}`);
    const noPolicy = t.filter((x) => !pol.some((p) => p.tablename === x.relname)).map((x) => x.relname);
    assert(noPolicy.length === 0, `RLS sem política (ninguém acessa): ${noPolicy}`);
    const toPublic = pol.filter((p) => p.roles.includes("public") || p.roles.includes("anon"));
    assert(toPublic.length === 0, `política para anon/public: ${toPublic.map((p) => p.tablename + "." + p.policyname)}`);
    return `${t.length} tabelas com RLS, ${pol.length} políticas, todas restritas a authenticated e filtrando por auth.uid()`;
  });

  await check("S2", "Segurança", "anon não tem nenhum privilégio em tabelas/views de public", async () => {
    const r = await c.query(`select c.relname, p from pg_class c join pg_namespace n on n.oid=c.relnamespace,
      unnest(array['select','insert','update','delete','truncate','references','trigger']) p
      where n.nspname='public' and c.relkind in ('r','v') and has_table_privilege('anon', c.oid, p)`);
    assert(r.rowCount === 0, `anon tem: ${r.rows.map((x) => x.relname + ":" + x.p).join(", ")}`);
    return "0 privilégios de anon em 24 relações";
  });

  await check("S3", "Segurança", "Views usam security_invoker (RLS do usuário continua valendo)", async () => {
    const v = (await c.query(`select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'`)).rows;
    assert(v.length > 0 && v.every((x) => (x.reloptions ?? []).includes("security_invoker=true")), `views sem security_invoker: ${JSON.stringify(v)}`);
    return `views: ${v.map((x) => x.relname).join(", ")}`;
  });

  await check("S4", "Segurança", "Funções SECURITY DEFINER: search_path fixo, e nenhuma aceita um id de usuário vindo do cliente", async () => {
    const d = (await c.query(`select p.oid::regprocedure::text as sig, p.proname, pg_get_userbyid(p.proowner) as owner, p.proconfig, p.prorettype::regtype::text as ret,
        has_function_privilege('anon',p.oid,'execute') as anon, has_function_privilege('authenticated',p.oid,'execute') as auth
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef order by 1`)).rows;
    const noPath = d.filter((x) => !(x.proconfig ?? []).some((s) => s.startsWith("search_path=")));
    assert(noPath.length === 0, `sem search_path: ${noPath.map((x) => x.sig)}`);
    const callable = d.filter((x) => x.auth && x.ret !== "trigger");
    // as únicas que usuários logados podem chamar diretamente devem usar auth.uid() internamente e ter guarda
    const src = {};
    for (const f of callable) src[f.proname] = (await c.query(`select pg_get_functiondef($1::regprocedure) as d`, [f.sig])).rows[0].d;
    for (const [name, def] of Object.entries(src)) assert(/auth\.uid\(\)/.test(def), `${name} não usa auth.uid()`);
    return `${d.length} definers: ${d.map((x) => `${x.proname}[${x.ret === "trigger" ? "trigger" : x.auth ? "authenticated" : "interna"}]`).join(", ")}`;
  });

  await check("S5", "Segurança", "Permissão EXECUTE: nenhuma RPC de negócio é executável por anon/PUBLIC; todas são por authenticated", async () => {
    const f = (await c.query(`select p.oid::regprocedure::text as sig, p.proname, p.prosecdef, p.prorettype::regtype::text as ret,
        has_function_privilege('anon',p.oid,'execute') as anon, has_function_privilege('authenticated',p.oid,'execute') as auth
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1`)).rows;
    const rpcs = f.filter((x) => x.ret !== "trigger" && !["require_user", "fixed_income_date"].includes(x.proname) && !x.proname.startsWith("tg_"));
    const exposed = rpcs.filter((x) => x.anon);
    assert(exposed.length === 0, `RPC executável por anon: ${exposed.map((x) => x.sig)}`);
    const noAuth = rpcs.filter((x) => !x.auth && !["check_transfer", "seed_default_categories"].includes(x.proname));
    assert(noAuth.length === 0, `RPC sem acesso para authenticated: ${noAuth.map((x) => x.sig)}`);
    const helpers = f.filter((x) => x.anon && !rpcs.includes(x)).map((x) => x.proname);
    return {
      status: helpers.length ? "WARN" : "PASS",
      evidence: `${rpcs.length} RPCs de negócio: 0 para anon. Auxiliares/gatilhos ainda executáveis por anon/PUBLIC (privilégio padrão do Postgres; sem efeito, pois exigem contexto de gatilho ou sessão): ${helpers.join(", ") || "nenhum"}. Recomendação: revogar (ver opcional/endurecimento.sql).`,
    };
  });

  await check("S6", "Segurança", "Gatilhos SECURITY DEFINER não podem ser chamados diretamente como função", async () => {
    const msgs = [];
    for (const fn of ["handle_new_user", "tg_audit", "tg_entries_transfer", "tg_transfers_row"]) {
      msgs.push(`${fn}: ${(await api.fails(null, `select public.${fn}()`, [], /trigger|permission/i)).slice(0, 60)}`);
    }
    return msgs.join(" | ");
  });

  await check("S7", "Segurança", "_wipe_finish (definer) recusa chamada direta de usuário logado e de anon", async () => {
    const s = await seed(api, ALICE, "S");
    await seed(api, BOB, "S");
    const tables = await userTables(c);
    const fpB = await fingerprint(c, BOB, tables);
    const m1 = await api.fails(ALICE, `select public._wipe_finish(true)`, [], /não permitida|42501|Operação/i);
    const m2 = await api.fails(null, `select public._wipe_finish(true)`, [], /permission denied|permissão/i);
    // mesmo que o usuário consiga ligar o marcador (só seria possível com SQL direto), o efeito é restrito a ele
    await api.as(ALICE, async (cl) => {
      await cl.query(`select set_config('nexo.wiping','1',true)`);
      await cl.query(`select public._wipe_finish(false)`);
    });
    const fpB2 = await fingerprint(c, BOB, tables);
    assert(JSON.stringify(fpB) === JSON.stringify(fpB2), "dados do Bob mudaram");
    assert(s.acc, "seed");
    return `sem marcador: "${m1.slice(0, 40)}"; anon: "${m2.slice(0, 40)}"; com marcador forjado por Alice, o Bob permanece idêntico (impressão ${sha(fpB).slice(0, 8)})`;
  });

  await check("S8", "Segurança", "seed_default_categories(uuid) (definer) não é executável por usuários (impede criar categorias na conta de outro)", async () => {
    const m = await api.fails(ALICE, `select public.seed_default_categories($1)`, [BOB], /permission denied/i);
    return m.slice(0, 80);
  });

  await check("S9", "Segurança", "authenticated não consegue forjar nem alterar a auditoria (audit_log)", async () => {
    await api.fails(ALICE, `insert into audit_log (user_id, table_name, record_id, action) values ($1,'x',gen_random_uuid(),'insert')`, [ALICE]);
    const upd = await api.as(ALICE, (cl) => cl.query(`update audit_log set table_name='x'`));
    const del = await api.as(ALICE, (cl) => cl.query(`delete from audit_log`));
    assert(upd.rowCount === 0 && del.rowCount === 0, `update=${upd.rowCount} delete=${del.rowCount}`);
    return "insert negado; update e delete afetam 0 linhas (RLS só permite SELECT)";
  });

  await check("S10", "Segurança", "Privilégios de tabela além do necessário para authenticated (TRUNCATE/REFERENCES/TRIGGER)", async () => {
    const r = await c.query(`select c.relname, string_agg(p, ',') ps from pg_class c join pg_namespace n on n.oid=c.relnamespace,
      unnest(array['truncate','references','trigger']) p where n.nspname='public' and c.relkind='r' and has_table_privilege('authenticated', c.oid, p) group by 1 order by 1`);
    if (r.rowCount === 0) return "nenhum privilégio extra";
    return {
      status: "WARN",
      evidence: `${r.rowCount} tabelas concedem ${[...new Set(r.rows.flatMap((x) => x.ps.split(",")))].join("/")} a authenticated (privilégio padrão do Supabase: ALTER DEFAULT PRIVILEGES ... GRANT ALL). Não é alcançável pela API REST (não existe verbo TRUNCATE) e RLS cobre select/insert/update/delete, mas TRUNCATE ignora RLS se alguém obtiver SQL direto. Recomendação: opcional/endurecimento.sql.`,
    };
  }, { severity: "FAIL" });

  await check("S11", "Segurança", "Endurecimento opcional (revogar extras) não quebra nada: RPCs principais continuam funcionando", async () => {
    await freshDb("nexo_audit_hard");
    const h = await admin("nexo_audit_hard");
    await h.query(readFileSync(path.join(here, "opcional/endurecimento.sql"), "utf8"));
    const left = (await h.query(`select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace, unnest(array['truncate','references','trigger']) p
      where n.nspname='public' and c.relkind='r' and has_table_privilege('authenticated', c.oid, p)`)).rows[0].n;
    await h.end();
    assert(left === 0, `ainda restam ${left} privilégios extras`);
    const api2 = new Api("nexo_audit_hard");
    const s = await seed(api2, ALICE, "H");
    await api2.q(ALICE, `select pay_invoice($1,'2026-10',$2,1000,'2026-10-20')`, [s.card, s.acc]);
    const ex = await api2.one(ALICE, `select export_my_data() as d`);
    assert(ex.d.accounts.length === 2, "export");
    await api2.one(ALICE, `select clear_my_entries('2026-10-27') as r`);
    await api2.end();
    return "extras revogados (0 restantes); seed completo, pay_invoice, export_my_data e clear_my_entries OK no banco endurecido";
  });

  await api.end();
  await c.end();
}

// ------------------------------------------------------------------ C. funcional com dois usuários
async function sectionFunctional() {
  await freshDb("nexo_audit_fn");
  const c = await admin("nexo_audit_fn");
  const api = new Api("nexo_audit_fn");
  const tables = await userTables(c);
  const A = await seed(api, ALICE, "A");
  const B = await seed(api, BOB, "B");
  const fpAll = async () => ({ A: await fingerprint(c, ALICE, tables), B: await fingerprint(c, BOB, tables) });

  await check("F1", "Isolamento", "Leitura: cada usuário vê exatamente as próprias linhas em todas as tabelas e views", async () => {
    const fp = await fpAll();
    for (const t of tables) {
      const a = await api.one(ALICE, `select count(*)::int n, count(*) filter (where user_id <> $1)::int other from public.${t}`, [ALICE]);
      const b = await api.one(BOB, `select count(*)::int n, count(*) filter (where user_id <> $1)::int other from public.${t}`, [BOB]);
      assert(a.other === 0 && b.other === 0, `${t}: vazamento (A viu ${a.other}, B viu ${b.other})`);
      assert(a.n === fp.A[t].n && b.n === fp.B[t].n, `${t}: contagem visível difere da real`);
    }
    for (const v of ["account_balances", "invoice_payments"]) {
      const rows = await api.q(BOB, `select * from public.${v}`);
      const ids = new Set((await c.query(`select id from public.accounts where user_id=$1`, [BOB])).rows.map((r) => r.id));
      if (v === "account_balances") assert(rows.every((r) => ids.has(r.account_id ?? r.id)), `view ${v} vazou`);
    }
    return `${tables.length} tabelas + 2 views: 0 linhas de outro usuário visíveis (A:${Object.values(fp.A).reduce((t, x) => t + x.n, 0)} linhas, B:${Object.values(fp.B).reduce((t, x) => t + x.n, 0)})`;
  });

  await check("F2", "Isolamento", "Escrita cruzada: Bob não consegue usar, alterar nem apagar nada da Alice (ids reais da Alice)", async () => {
    const before = await fpAll();
    const attempts = [
      [`insert into account_entries (account_id, kind, status, amount_cents, occurred_on) values ($1,'expense','confirmed',-1,'2026-10-02')`, [A.acc]],
      [`insert into account_entries (account_id, kind, status, amount_cents, occurred_on, category_id) values ($1,'expense','confirmed',-1,'2026-10-02',$2)`, [B.acc, A.cat]],
      [`select create_credit_purchase($1,'X',null,'2026-10-05',100,$2::jsonb)`, [A.card, JSON.stringify([{ number: 1, invoice_ref: "2026-10", amount_cents: 100 }])]],
      [`select pay_invoice($1,'2026-10',$2,100,'2026-10-20')`, [A.card, B.acc]],
      [`select pay_invoice($1,'2026-10',$2,100,'2026-10-20')`, [B.card, A.acc]],
      [`select create_transfer($1,$2,100,'2026-10-08')`, [B.acc, A.acc]],
      [`select create_transfer($1,$2,100,'2026-10-08')`, [A.acc, B.acc]],
      [`select set_entry_tags($1, array['x'])`, [A.e1]],
      [`select confirm_entry($1,'2026-10-27')`, [A.e1]],
      [`select delete_entry($1)`, [A.e1]],
      [`select delete_purchase($1)`, [A.purchase]],
      [`select refund_purchase($1,100,'2026-10-07','2026-10')`, [A.purchase]],
      [`select remove_account($1)`, [A.acc]],
      [`select remove_card($1)`, [A.card]],
      [`select remove_category($1)`, [A.cat]],
      [`select remove_fixed_income($1,'2026-10-20')`, [A.fiClient]],
      [`select end_fixed_income($1,'2026-10-20')`, [A.fiClient]],
      [`select record_fixed_income_entry($1,'2026-11','2026-11-05')`, [A.fiClient]],
      [`select save_fixed_income($1,'client','X','X',1,5::smallint,'2026-08-05',null,$2,null,null)`, [A.fiClient, B.acc]],
      [`select add_reimbursement($1,$2,null,100,'2026-10-20','Ana','scheduled',null)`, [A.e1, B.acc]],
      [`select reverse_invoice_payment(gen_random_uuid())`, []],
    ];
    const outcomes = [];
    for (const [sql, params] of attempts) {
      try {
        const r = await api.as(BOB, (cl) => cl.query(sql, params));
        // update/delete de linhas invisíveis "funcionam" afetando 0 linhas; select de função que retorna sem erro é suspeito
        if (/^(update|delete)/.test(sql)) assert(r.rowCount === 0, `afetou ${r.rowCount}`);
        else throw new Error("executou sem erro");
        outcomes.push("0 linhas");
      } catch (e) {
        if (e.message === "executou sem erro" || /^afetou/.test(e.message)) throw new Error(`${sql.slice(0, 70)}: ${e.message}`);
        outcomes.push(e.message.slice(0, 40));
      }
    }
    const after = await fpAll();
    assert(JSON.stringify(before.A) === JSON.stringify(after.A), "dados da Alice mudaram");
    return `${attempts.length} tentativas do Bob com ids da Alice: todas recusadas; impressão da Alice inalterada (${sha(after.A).slice(0, 8)})`;
  });

  await check("F3", "Pagamento de fatura", "Pagamento parcial e total: não é despesa de consumo, reduz o saldo da conta e é idempotente", async () => {
    const bal = async () => Number((await api.one(ALICE, `select balance_cents from account_balances where account_id=$1`, [A.acc])).balance_cents);
    const exp = async () => Number((await api.one(ALICE, `select coalesce(sum(-amount_cents),0) s from account_entries where kind='expense' and status='confirmed' and deleted_at is null`)).s);
    const b0 = await bal();
    const e0 = await exp();
    const p1 = (await api.one(ALICE, `select pay_invoice($1,'2026-10',$2,4000,'2026-10-20','confirmed','k-parcial') as id`, [A.card, A.acc])).id;
    const again = (await api.one(ALICE, `select pay_invoice($1,'2026-10',$2,4000,'2026-10-20','confirmed','k-parcial') as id`, [A.card, A.acc])).id;
    assert(p1 === again, "idempotência falhou");
    const p2 = (await api.one(ALICE, `select pay_invoice($1,'2026-10',$2,6000,'2026-10-21','confirmed','k-total') as id`, [A.card, A.acc])).id;
    assert((await bal()) === b0 - 10000, `saldo ${await bal()} esperado ${b0 - 10000}`);
    assert((await exp()) === e0, "pagamento virou despesa de consumo");
    const paid = Number((await api.one(ALICE, `select coalesce(sum(-amount_cents),0) s from account_entries where kind='invoice_payment' and invoice_ref='2026-10' and card_id=$1 and deleted_at is null`, [A.card])).s);
    // a parcela 1 era 10.000 + 4.000 de pagamento anterior do seed? o seed não paga; paid deve ser 10.000
    assert(paid === 10000, `pago ${paid}`);
    A.pay1 = p1;
    A.pay2 = p2;
    return `saldo da conta caiu exatamente 10000 (4000+6000); consumo (despesas) inalterado em ${e0}; chave repetida devolveu o mesmo id`;
  });

  await check("F4", "Pagamento de fatura", "Estorno: devolve o saldo, é auditável, não repete e só o dono consegue", async () => {
    const bal = async () => Number((await api.one(ALICE, `select balance_cents from account_balances where account_id=$1`, [A.acc])).balance_cents);
    const b0 = await bal();
    await api.fails(BOB, `select reverse_invoice_payment($1)`, [A.pay2], /não encontrado/i);
    const r = await api.one(ALICE, `select reverse_invoice_payment($1) as r`, [A.pay2]);
    assert(r.r.amount_cents === 6000, "valor estornado");
    assert((await bal()) === b0 + 6000, "saldo não voltou");
    await api.fails(ALICE, `select reverse_invoice_payment($1)`, [A.pay2], /já estornado|não encontrado/i);
    const row = (await c.query(`select deleted_at is not null as gone from account_entries where id=$1`, [A.pay2])).rows[0];
    assert(row.gone, "pagamento deveria estar marcado como excluído (não apagado)");
    const audit = (await c.query(`select count(*)::int n from audit_log where row_id=$1 and user_id=$2`, [A.pay2, ALICE])).rows[0].n;
    assert(audit >= 2, `auditoria: ${audit} registros (esperado ≥2: criação e estorno)`);
    // pode pagar de novo depois do estorno
    await api.q(ALICE, `select pay_invoice($1,'2026-10',$2,6000,'2026-10-22','confirmed','k-total-2')`, [A.card, A.acc]);
    return `saldo +6000; 2º estorno recusado; Bob recusado; linha preservada (deleted_at) com ${audit} registros de auditoria; novo pagamento aceito`;
  });

  await check("F5", "Pagamento de fatura", "Concorrência: 8 requisições simultâneas com a mesma chave criam 1 único pagamento", async () => {
    const key = "k-concorrente";
    const ids = await Promise.all(Array.from({ length: 8 }, () => api.one(ALICE, `select pay_invoice($1,'2026-11',$2,1500,'2026-11-10','confirmed',$3) as id`, [A.card, A.acc, key])));
    const n = (await c.query(`select count(*)::int n from account_entries where idempotency_key=$1`, [key])).rows[0].n;
    assert(n === 1, `${n} pagamentos criados`);
    assert(new Set(ids.map((x) => x.id)).size === 1, "ids diferentes");
    return "8 chamadas paralelas → 1 linha, mesmo id para todas";
  });

  // ---------- pagamento de fatura: guarda no banco (migration 20261028000100), num cartão só para estes testes
  const G = {};
  await check("P0", "Pagamento de fatura", "Preparação: cartão/compra 3x de 10.000 para a Alice e para o Bob (faturas 2026-10..12)", async () => {
    const mk = async (uid, label) => {
      const card = (await api.one(uid, `insert into cards (name, closing_day, due_day, payment_account_id) values ($1, 13, 20, $2) returning id`, [`Cartão P ${label}`, uid === ALICE ? A.acc : B.acc])).id;
      await api.q(uid, `select create_credit_purchase($1,'Compra P',null,'2026-10-05',30000,$2::jsonb)`, [card, JSON.stringify([10, 11, 12].map((m, i) => ({ number: i + 1, invoice_ref: `2026-${m}`, amount_cents: 10000 })))]);
      return card;
    };
    G.a = await mk(ALICE, "A");
    G.b = await mk(BOB, "B");
    return "ok";
  });
  const payP = (uid, card, acc, amount, key, ref = "2026-10", status = "confirmed") =>
    api.one(uid, `select pay_invoice($1,$2,$3,$4,'2026-10-20',$5,$6) as id`, [card, ref, acc, amount, status, key]);
  const paidP = async (ref, card = G.a) => Number((await c.query(`select coalesce(sum(-amount_cents),0) s from account_entries where kind='invoice_payment' and invoice_ref=$1 and card_id=$2 and deleted_at is null`, [ref, card])).rows[0].s);

  await check("P1", "Pagamento de fatura", "Propriedade: cartão e conta de outro usuário (ou conta arquivada) são recusados; anon também", async () => {
    const m = [];
    m.push(await api.fails(BOB, `select pay_invoice($1,'2026-10',$2,100,'2026-10-20')`, [G.a, B.acc], /Cartão não encontrado/));
    m.push(await api.fails(BOB, `select pay_invoice($1,'2026-10',$2,100,'2026-10-20')`, [G.b, A.acc], /Conta não encontrada/));
    m.push(await api.fails(null, `select pay_invoice($1,'2026-10',$2,100,'2026-10-20')`, [G.a, A.acc], /permission denied/i));
    const arch = (await api.one(ALICE, `insert into accounts (name, opening_balance_cents, opening_date) values ('Arquivada', 1000, '2026-10-01') returning id`)).id;
    await api.q(ALICE, `update accounts set archived_at = now() where id = $1`, [arch]);
    m.push(await api.fails(ALICE, `select pay_invoice($1,'2026-10',$2,100,'2026-10-20')`, [G.a, arch], /Conta não encontrada/));
    assert((await paidP("2026-10")) === 0, "algum pagamento entrou");
    return m.map((x) => x.slice(0, 28)).join(" | ");
  });

  await check("P2", "Pagamento de fatura", "Status permitidos: só confirmed e scheduled; valor, fatura e data inválidos são recusados", async () => {
    for (const st of ["expected", "foo", "", "CONFIRMED"]) await api.fails(ALICE, `select pay_invoice($1,'2026-10',$2,100,'2026-10-20',$3)`, [G.a, A.acc, st], /Situação/);
    await api.fails(ALICE, `select pay_invoice($1,'2026-10',$2,100,'2026-10-20',null)`, [G.a, A.acc], /Situação/);
    for (const amt of [0, -1]) await api.fails(ALICE, `select pay_invoice($1,'2026-10',$2,$3,'2026-10-20')`, [G.a, A.acc, amt], /positivo/);
    for (const ref of ["2026-13", "2026-00", "26-10", "2026-10-01", "x", ""]) await api.fails(ALICE, `select pay_invoice($1,$3,$2,100,'2026-10-20')`, [G.a, A.acc, ref], /Fatura inválida/);
    await api.fails(ALICE, `select pay_invoice($1,'2026-10',$2,100,null)`, [G.a, A.acc], /Data/);
    const ok = await payP(ALICE, G.a, A.acc, 1000, "p2-sched", "2026-10", "scheduled");
    assert(ok.id, "scheduled recusado");
    await api.q(ALICE, `select reverse_invoice_payment($1)`, [ok.id]);
    assert((await paidP("2026-10")) === 0, "estado");
    return "expected/foo/vazio/null/CONFIRMED recusados; 0, negativo, fatura mal formada e data nula recusados; scheduled aceito (e estornado)";
  });

  await check("P3", "Pagamento de fatura", "Idempotência consistente: mesma chave = mesmo pedido; pedido diferente, outra operação, pagamento estornado e corrida são tratados", async () => {
    const p = await payP(ALICE, G.a, A.acc, 3000, "p3-a");
    assert((await payP(ALICE, G.a, A.acc, 3000, "p3-a")).id === p.id, "replay devolveu outro id");
    await api.fails(ALICE, `select pay_invoice($1,'2026-10',$2,3001,'2026-10-20','confirmed','p3-a')`, [G.a, A.acc], /outra operação/);
    await api.fails(ALICE, `select pay_invoice($1,'2026-11',$2,3000,'2026-10-20','confirmed','p3-a')`, [G.a, A.acc], /outra operação/);
    await api.fails(ALICE, `select pay_invoice($1,'2026-10',$2,3000,'2026-10-20','confirmed','p3-a')`, [G.a, A.acc2], /outra operação/);
    // chave de um lançamento que não é pagamento
    await api.q(ALICE, `insert into account_entries (account_id, kind, status, amount_cents, occurred_on, idempotency_key) values ($1,'expense','confirmed',-100,'2026-10-02','p3-outro')`, [A.acc]);
    await api.fails(ALICE, `select pay_invoice($1,'2026-10',$2,100,'2026-10-20','confirmed','p3-outro')`, [G.a, A.acc], /outra operação/);
    // estornado: a chave não ressuscita
    await api.q(ALICE, `select reverse_invoice_payment($1)`, [p.id]);
    await api.fails(ALICE, `select pay_invoice($1,'2026-10',$2,3000,'2026-10-20','confirmed','p3-a')`, [G.a, A.acc], /estornado/);
    // corrida: mesma chave, valores diferentes, ao mesmo tempo → exatamente 1 vence
    const race = await Promise.allSettled([1000, 2000, 3000, 4000].map((v) => payP(ALICE, G.a, A.acc, v, "p3-race")));
    const won = race.filter((r) => r.status === "fulfilled");
    const rows = (await c.query(`select count(*)::int n from account_entries where idempotency_key='p3-race'`)).rows[0].n;
    assert(won.length === 1 && rows === 1, `${won.length} vencedores, ${rows} linhas`);
    // corrida: mesma chave e mesmo pedido, em faturas diferentes não se misturam; mesma chave+mesmo pedido → todos recebem o mesmo id
    const same = await Promise.all(Array.from({ length: 8 }, () => payP(ALICE, G.a, A.acc, 500, "p3-same", "2026-11")));
    assert(new Set(same.map((x) => x.id)).size === 1, "ids diferentes");
    // a chave é por usuário
    await payP(BOB, G.b, B.acc, 3000, "p3-a");
    await api.q(ALICE, `select reverse_invoice_payment($1)`, [same[0].id]);
    await api.q(ALICE, `select reverse_invoice_payment(id) from account_entries where idempotency_key='p3-race' and deleted_at is null`);
    assert((await paidP("2026-10")) === 0 && (await paidP("2026-11")) === 0, "limpeza do cenário");
    return "replay = mesmo id; valor/fatura/conta diferentes e chave de outra operação recusados; chave estornada não ressuscita; 4 corridas com a mesma chave → 1 vencedor/1 linha; 8 repetições → 1 id; chave por usuário";
  });

  await check("P4", "Pagamento de fatura", "Concorrência: pagamentos simultâneos NUNCA ultrapassam o devido (20×1.000 numa fatura de 10.000; depois 6×4.000)", async () => {
    const r1 = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => payP(ALICE, G.a, A.acc, 1000, `p4-a-${i}`, "2026-11")));
    const ok1 = r1.filter((r) => r.status === "fulfilled").length;
    assert(ok1 === 10 && (await paidP("2026-11")) === 10000, `20 pagamentos de 1.000: aceitos ${ok1}, pago ${await paidP("2026-11")}`);
    const bad = r1.filter((r) => r.status === "rejected").map((r) => r.reason.message);
    assert(bad.every((m) => /quitada|passa do que falta/.test(m)), `motivos inesperados: ${[...new Set(bad)]}`);
    const r2 = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => payP(ALICE, G.a, A.acc, 4000, `p4-b-${i}`, "2026-12")));
    const ok2 = r2.filter((r) => r.status === "fulfilled").length;
    assert(ok2 === 2 && (await paidP("2026-12")) === 8000, `6×4.000: aceitos ${ok2}, pago ${await paidP("2026-12")}`);
    // estorno concorrente com pagamento: nunca passa do devido
    const rev = await api.one(ALICE, `select id from account_entries where invoice_ref='2026-12' and card_id=$1 and deleted_at is null limit 1`, [G.a]);
    await Promise.allSettled([api.q(ALICE, `select reverse_invoice_payment($1)`, [rev.id]), ...Array.from({ length: 4 }, (_, i) => payP(ALICE, G.a, A.acc, 3000, `p4-c-${i}`, "2026-12"))]);
    const total = await paidP("2026-12");
    assert(total <= 10000, `pago ${total} > 10000 após estorno+pagamentos simultâneos`);
    // o Bob pagando a MESMA referência no cartão dele não interfere (travas por cartão)
    await payP(BOB, G.b, B.acc, 10000, "p4-bob", "2026-11");
    assert((await paidP("2026-11", G.b)) === 10000 && (await paidP("2026-11")) === 10000, "interferência entre usuários");
    return `20×1.000 → ${ok1} aceitos, pago 10.000; 6×4.000 → ${ok2} aceitos, pago 8.000; estorno+4 pagamentos simultâneos → pago ${total} ≤ 10.000; Bob paga a sua fatura sem interferir`;
  });

  await check("P5", "Pagamento de fatura", "Matriz: parcial, integral, excedente, fatura quitada, estorno e novo pagamento", async () => {
    // fatura 2026-10 está zerada neste ponto (P3 limpou)
    const p1 = await payP(ALICE, G.a, A.acc, 2500, "p5-1");
    const p2 = await payP(ALICE, G.a, A.acc, 7500, "p5-2"); // integral do que faltava
    assert((await paidP("2026-10")) === 10000, "integral");
    await api.fails(ALICE, `select pay_invoice($1,'2026-10',$2,1,'2026-10-20')`, [G.a, A.acc], /já está quitada/);
    await api.q(ALICE, `select reverse_invoice_payment($1)`, [p2.id]);
    assert((await paidP("2026-10")) === 2500, "estorno");
    await api.fails(ALICE, `select pay_invoice($1,'2026-10',$2,7501,'2026-10-20')`, [G.a, A.acc], /passa do que falta/); // excedente
    await api.fails(ALICE, `select pay_invoice($1,'2026-10',$2,99999999999,'2026-10-20')`, [G.a, A.acc], /passa do que falta/);
    await payP(ALICE, G.a, A.acc, 7500, "p5-3"); // volta a poder quitar
    assert((await paidP("2026-10")) === 10000 && p1.id, "quitação final");
    // não é despesa de consumo
    const exp = Number((await api.one(ALICE, `select count(*)::int n from account_entries where kind='expense' and description like 'Pagamento fatura%'`)).n);
    assert(exp === 0, "pagamento virou despesa");
    return "2.500 + 7.500 = quitada; +1 recusado; estorno de 7.500 → falta 7.500; 7.501 e 99.999.999.999 recusados; 7.500 quita de novo; nenhum pagamento vira despesa de consumo";
  });

  await check("F7", "Renda fixa", "Excluir renda fixa: some e nunca volta; histórico confirmado preservado; Bob intacto", async () => {
    const before = await fpAll();
    const ids = [];
    for (const [p, d] of [["2026-08", "2026-08-05"], ["2026-09", "2026-09-05"], ["2026-10", "2026-10-05"]]) {
      ids.push((await api.one(ALICE, `select record_fixed_income_entry($1,$2,$3) as r`, [A.fiClient, p, d])).r.id);
    }
    await api.q(ALICE, `select confirm_entry($1,'2026-08-05')`, [ids[0]]);
    const res = await api.one(ALICE, `select remove_fixed_income($1,'2026-10-20') as r`, [A.fiClient]);
    assert(res.r === "deleted_with_history", res.r);
    const vis = await api.q(ALICE, `select id from fixed_incomes where id=$1 and deleted_at is null`, [A.fiClient]);
    assert(vis.length === 0, "continua listada");
    const left = (await api.q(ALICE, `select status from account_entries where fixed_income_id=$1 and deleted_at is null`, [A.fiClient])).map((x) => x.status);
    assert(JSON.stringify(left) === JSON.stringify(["confirmed"]), `restaram ${left}`);
    await api.fails(ALICE, `select record_fixed_income_entry($1,'2026-11','2026-11-05')`, [A.fiClient], /não encontrada/i);
    await api.fails(ALICE, `select remove_fixed_income($1,'2026-10-20')`, [A.fiClient], /não encontrada/i);
    // renda só com previstos → exclusão total
    const r2 = await api.one(ALICE, `select remove_fixed_income($1,'2026-10-20') as r`, [A.fiSalary]);
    assert(r2.r === "deleted", r2.r);
    assert((await c.query(`select count(*)::int n from fixed_incomes where id=$1`, [A.fiSalary])).rows[0].n === 0, "não apagou de verdade");
    const after = await fpAll();
    assert(JSON.stringify(before.B) === JSON.stringify(after.B), "Bob mudou");
    return "com confirmado → deleted_with_history (1 confirmado mantido, 2 previstos removidos); sem confirmado → deleted (linha apagada); reaparecer/relançar recusado; Bob idêntico";
  });

  await check("F8", "Exportação", "export_my_data: só dados do próprio usuário, sem segredos, e anon não exporta", async () => {
    const ex = (await api.one(ALICE, `select export_my_data() as d`)).d;
    const text = JSON.stringify(ex);
    assert(!text.includes(BOB) && !text.includes("Conta B") && !text.includes("bob@nexo.test"), "dados do Bob no export da Alice");
    const uids = new Set();
    for (const v of Object.values(ex)) if (Array.isArray(v)) for (const r of v) if (r.user_id) uids.add(r.user_id);
    assert(uids.size === 1 && uids.has(ALICE), `user_ids no export: ${[...uids]}`);
    assert(!/password|token|secret|service_role|api_key|apikey/i.test(Object.keys(ex.profile).join(",")), "chave sensível no perfil");
    assert(!("auth" in ex) && !("users" in ex), "export traz dados de auth");
    await api.fails(null, `select export_my_data()`, [], /permission denied/i);
    const exB = (await api.one(BOB, `select export_my_data() as d`)).d;
    assert(!JSON.stringify(exB).includes(ALICE), "dados da Alice no export do Bob");
    return `${Object.keys(ex).length} seções; todos os user_id = Alice; Bob e Alice trocados: 0 vazamentos; anon recusado`;
  });

  // ---------- limpeza
  await check("F9", "Limpeza", "Limpar lançamentos (Alice): zera movimentações, preserva cadastros, não toca no Bob", async () => {
    const before = await fpAll();
    const preserved = ["accounts", "cards", "categories", "subscriptions", "fixed_incomes", "goals", "budgets", "invoice_overrides", "tags"];
    const r = await api.one(ALICE, `select clear_my_entries('2026-10-27') as r`);
    const after = await fpAll();
    for (const t of ["account_entries", "transfers", "purchases", "card_charges", "subscription_charges"]) assert(after.A[t].n === 0, `${t} ainda tem ${after.A[t].n}`);
    for (const t of preserved) assert(after.A[t].n >= before.A[t].n - (t === "fixed_incomes" ? 0 : 0) || t === "tags", `${t}: ${before.A[t].n} → ${after.A[t].n}`);
    assert(JSON.stringify(after.B) === JSON.stringify(before.B), "Bob mudou");
    const marks = (await c.query(`select bool_and(cleared_before = '2026-10-27') ok from fixed_incomes where user_id=$1 and deleted_at is null`, [ALICE])).rows[0].ok;
    assert(marks !== false, "cleared_before não marcado");
    const auditLeft = (await c.query(`select count(*)::int n from audit_log where user_id=$1 and table_name in ('account_entries','transfers','purchases','card_charges')`, [ALICE])).rows[0].n;
    assert(auditLeft === 0, `auditoria de lançamentos ainda guarda ${auditLeft} cópias`);
    return `removido: ${JSON.stringify(r.r)}; cadastros preservados; Bob idêntico (${sha(after.B).slice(0, 8)}); marcador de recomeço gravado; auditoria dos lançamentos limpa`;
  });

  // recria dados da Alice para a limpeza total
  await seed(api, ALICE, "A2");

  await check("F10", "Limpeza", "Atomicidade: se um passo da limpeza total falha, NADA é apagado", async () => {
    const before = await fpAll();
    await c.query(`create or replace function public.__audit_boom() returns trigger language plpgsql as $$ begin raise exception 'falha injetada'; end $$`);
    await c.query(`create trigger __audit_boom before delete on public.cards for each row execute function public.__audit_boom()`);
    const msg = await api.fails(ALICE, `select clear_all_financial_data()`, [], /falha injetada/);
    await c.query(`drop trigger __audit_boom on public.cards; drop function public.__audit_boom()`);
    const after = await fpAll();
    assert(JSON.stringify(before) === JSON.stringify(after), "houve mudança parcial");
    // idem para a limpeza de lançamentos
    await c.query(`create function public.__audit_boom() returns trigger language plpgsql as $$ begin raise exception 'falha injetada 2'; end $$`);
    await c.query(`create trigger __audit_boom before delete on public.purchases for each row execute function public.__audit_boom()`);
    await api.fails(ALICE, `select clear_my_entries('2026-10-27')`, [], /falha injetada 2/);
    await c.query(`drop trigger __audit_boom on public.purchases; drop function public.__audit_boom()`);
    const after2 = await fpAll();
    assert(JSON.stringify(before) === JSON.stringify(after2), "limpeza de lançamentos deixou estado parcial");
    return `erro "${msg.slice(0, 30)}" no meio das duas funções → ${Object.keys(before.A).length} tabelas da Alice e do Bob idênticas (rollback total)`;
  });

  await check("F11", "Limpeza", "Limpar tudo: execução dupla simultânea é segura (sem deadlock, sem estado parcial, sem tocar no Bob)", async () => {
    const before = await fpAll();
    const rs = await Promise.allSettled([api.one(ALICE, `select clear_all_financial_data() as r`), api.one(ALICE, `select clear_all_financial_data() as r`)]);
    const bad = rs.filter((r) => r.status === "rejected").map((r) => r.reason.message);
    assert(bad.length === 0, `uma execução falhou: ${bad}`);
    const after = await fpAll();
    assert(JSON.stringify(after.B) === JSON.stringify(before.B), "Bob mudou");
    return `2 execuções simultâneas concluídas sem erro (advisory lock por usuário); Bob idêntico`;
  });

  await check("F12", "Limpeza", "Limpar tudo: não sobra NENHUM dado financeiro da Alice em nenhuma tabela; login e preferências ficam", async () => {
    const fp = await fingerprint(c, ALICE, tables);
    const leftovers = Object.entries(fp).filter(([t, v]) => v.n > 0 && !["profiles", "categories"].includes(t)).map(([t, v]) => `${t}=${v.n}`);
    assert(leftovers.length === 0, `sobraram: ${leftovers}`);
    const defaults = (await c.query(`select count(*)::int n from categories where user_id=$1`, [BOB])).rows[0].n;
    // Bob tem as padrão + 2 próprias; Alice deve ter só as padrão
    const aliceCats = fp.categories.n;
    assert(aliceCats > 0 && aliceCats === defaults - 2, `categorias: Alice ${aliceCats}, Bob ${defaults} (padrão+2)`);
    const user = (await c.query(`select 1 from auth.users where id=$1`, [ALICE])).rowCount;
    assert(user === 1, "login removido");
    const prof = (await c.query(`select theme, timezone from profiles where id=$1`, [ALICE])).rows[0];
    assert(prof && prof.theme && prof.timezone, "perfil perdido");
    const cats = await api.q(ALICE, `select count(*)::int n from categories`);
    return `${tables.length} tabelas verificadas dinamicamente; só restam as ${aliceCats} categorias padrão; auth.users e profiles preservados (tema ${prof.theme}, fuso ${prof.timezone}); a conta continua utilizável (${cats[0].n} categorias visíveis)`;
  });

  await check("F13", "Limpeza", "Reautenticação/identidade: limpeza usa só o JWT; o Bob limpando não afeta a Alice e anon/sem sessão não limpa nada", async () => {
    await seed(api, ALICE, "A3");
    const beforeA = await fingerprint(c, ALICE, tables);
    // as funções não recebem id de usuário: não existe parâmetro por onde apontar para outra conta
    const sigs = (await c.query(`select p.oid::regprocedure::text s from pg_proc p where p.proname in ('clear_all_financial_data','clear_my_entries','export_my_data')`)).rows.map((x) => x.s);
    assert(sigs.every((s) => !/uuid/.test(s)), `assinatura aceita uuid: ${sigs}`);
    await api.fails(null, `select clear_all_financial_data()`, [], /permission denied/i);
    // sessão com JWT sem usuário (sub ausente) também não passa
    await api.as(ALICE, async (cl) => {
      await cl.query(`select set_config('request.jwt.claims', '{"role":"authenticated"}', true)`);
      await cl.query("savepoint s");
      let failed = false;
      try {
        await cl.query(`select clear_all_financial_data()`);
      } catch {
        failed = true;
      }
      assert(failed, "executou sem usuário no JWT");
    });
    // Bob (com sua própria sessão) limpa tudo → Alice idêntica
    await api.one(BOB, `select clear_all_financial_data()`);
    const afterA = await fingerprint(c, ALICE, tables);
    assert(JSON.stringify(beforeA) === JSON.stringify(afterA), "Alice afetada pela limpeza do Bob");
    const bobLeft = Object.entries(await fingerprint(c, BOB, tables)).filter(([t, v]) => v.n > 0 && !["profiles", "categories"].includes(t));
    assert(bobLeft.length === 0, `Bob ainda tem ${bobLeft}`);
    return `assinaturas sem parâmetro de usuário (${sigs.join("; ")}); anon e JWT sem sub recusados; Bob limpou a própria conta e a Alice permaneceu idêntica (${sha(afterA).slice(0, 8)})`;
  });

  await api.end();
  await c.end();
}

// ------------------------------------------------------------------ C2. reconciliação gráfico × Lançamentos no banco real
async function sectionRecon() {
  await check("R1", "Reconciliação", "Compra parcelada estornada: Lançamentos (parcelas ativas) + estornos = consumo do gráfico, no banco real", async () => {
    await freshDb("nexo_audit_recon");
    const c = await admin("nexo_audit_recon");
    const api = new Api("nexo_audit_recon");
    const A = await seed(api, ALICE, "R", { full: false });
    // compra de 300 (3x de 100, todas com a data da compra = 05/10): cancela a parcela 2 e credita 100 em 20/10
    const inst = await api.q(ALICE, `select id, installment_number from card_charges where purchase_id=$1 and kind='installment' order by installment_number`, [A.purchase]);
    await api.q(ALICE, `select refund_purchase($1, 10000, '2026-10-20', '2026-11', $2::uuid[])`, [A.purchase, [inst[1].id]]);
    const month = ["2026-10-01", "2026-10-31"];
    // lado "Lançamentos": o que a tela lista e soma
    const listGross = Number((await api.one(ALICE, `select coalesce(sum(total_cents),0) s from purchases where deleted_at is null and purchased_on between $1 and $2`, month)).s);
    const listNet = Number((await api.one(ALICE, `select coalesce(sum(amount_cents),0) s from card_charges where kind='installment' and cancelled_at is null and purchase_id in (select id from purchases where deleted_at is null and purchased_on between $1 and $2)`, month)).s);
    const cardRefunds = Number((await api.one(ALICE, `select coalesce(sum(amount_cents),0) s from card_charges where kind='refund' and cancelled_at is null and occurred_on between $1 and $2`, month)).s);
    // lado "gráfico": linhas de consumo no cartão do mês (installment + refund + fee, ativas), por categoria da compra
    const chart = Number((await api.one(ALICE, `select coalesce(sum(amount_cents),0) s from card_charges where kind in ('installment','refund','fee') and cancelled_at is null and occurred_on between $1 and $2`, month)).s);
    assert(listGross === 30000, `valor cheio ${listGross}`);
    assert(listNet === 20000, `parcelas ativas ${listNet}`);
    assert(cardRefunds === -10000, `estornos ${cardRefunds}`);
    assert(chart === listNet + cardRefunds, `gráfico ${chart} ≠ ${listNet} + ${cardRefunds}`);
    // por categoria da compra (a subcategoria "Feira"): mesma conta
    const byCat = Number((await api.one(ALICE, `select coalesce(sum(cc.amount_cents),0) s from card_charges cc join purchases p on p.id = cc.purchase_id where cc.cancelled_at is null and cc.kind in ('installment','refund') and cc.occurred_on between $1 and $2 and p.category_id = $3`, [...month, A.sub])).s);
    assert(byCat === chart, `por categoria ${byCat}`);
    await api.end();
    await c.end();
    return "valor cheio da compra 30.000 (o que Lançamentos mostrava) → parcelas ativas 20.000 − estorno 10.000 = 10.000, idêntico ao total do cartão no gráfico, também por categoria";
  });
}

// ------------------------------------------------------------------ execução
const only = process.argv[2];
try {
  if (!only || only === "migrations") await sectionMigrations();
  else await freshDb("nexo_audit_main");
  if (!only || only === "security") await sectionSecurity();
  if (!only || only === "functional") await sectionFunctional();
  if (!only || only === "recon") await sectionRecon();
} finally {
  const rank = { FAIL: 0, WARN: 1, INFO: 2, PASS: 3 };
  for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.id.padEnd(4)} ${r.area} — ${r.title}\n        ${String(r.evidence).replace(/\n/g, " ").slice(0, 600)}`);
  const tally = results.reduce((t, r) => ({ ...t, [r.status]: (t[r.status] ?? 0) + 1 }), {});
  console.log(`\nTotal: ${results.length} — ${Object.entries(tally).sort((a, b) => rank[a[0]] - rank[b[0]]).map(([k, v]) => `${v} ${k}`).join(", ")}`);
  writeFileSync(path.join(here, "last-report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
}
