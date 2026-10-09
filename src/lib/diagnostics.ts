import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

export type CheckStatus = "ok" | "error" | "warning" | "skipped";

export interface Check {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

const TIMEOUT = 6000;

function decodeJwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/** Erros do PostgREST indicam se o objeto existe: sem permissão = existe; não encontrado = falta migration. */
function existsFromError(code: string | undefined): "exists" | "missing" | "unknown" {
  if (!code) return "exists";
  if (code === "42501") return "exists"; // permission denied: existe, mas anônimo não acessa (correto)
  if (code === "PGRST205" || code === "PGRST202" || code === "42P01" || code === "42883") return "missing";
  return "unknown";
}

/**
 * Verifica, em ordem, tudo o que o login precisa para funcionar.
 * Usa apenas a chave pública (e a secreta, se existir, só no servidor).
 */
export async function runDiagnostics(): Promise<Check[]> {
  const checks: Check[] = [];
  const url = SUPABASE_URL;
  const key = SUPABASE_KEY;

  // 1. arquivo .env.local
  if (!url || !key) {
    checks.push({
      id: "env",
      title: "Chaves do Supabase no .env.local",
      status: "error",
      detail: !url && !key ? "Nenhuma das duas variáveis foi encontrada." : !url ? "Falta NEXT_PUBLIC_SUPABASE_URL." : "Falta NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      fix: "Crie o arquivo .env.local na pasta do projeto (copiando o .env.example), cole a URL e a chave pública, salve e reinicie o npm run dev.",
    });
    return checks;
  }
  const keyRole = decodeJwtRole(key);
  if (key.startsWith("sb_secret_") || keyRole === "service_role") {
    checks.push({
      id: "env",
      title: "Chaves do Supabase no .env.local",
      status: "error",
      detail: "A chave em NEXT_PUBLIC_SUPABASE_ANON_KEY é a chave SECRETA (service_role). Ela daria acesso total ao banco pelo navegador.",
      fix: "Troque pela chave pública: \"anon public\" ou \"Publishable key\". A secreta vai só em SUPABASE_SERVICE_ROLE_KEY.",
    });
    return checks;
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
    checks.push({
      id: "env",
      title: "Chaves do Supabase no .env.local",
      status: "warning",
      detail: `A URL "${url}" não tem o formato esperado (https://xxxx.supabase.co).`,
      fix: "Copie a \"Project URL\" em Project Settings → Data API, sem barras ou caminhos no final.",
    });
  } else {
    checks.push({ id: "env", title: "Chaves do Supabase no .env.local", status: "ok", detail: "URL e chave pública encontradas." });
  }

  // 2. conexão + configurações de autenticação
  let settings: { mailer_autoconfirm?: boolean; disable_signup?: boolean; external?: { email?: boolean } } | null = null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(TIMEOUT),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      checks.push({
        id: "connection",
        title: "Conexão com o Supabase",
        status: "error",
        detail: "O Supabase respondeu, mas recusou a chave.",
        fix: "Confira se a chave pública é do mesmo projeto da URL e se foi copiada inteira, sem espaços ou aspas.",
      });
      return checks;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    settings = await res.json();
    checks.push({ id: "connection", title: "Conexão com o Supabase", status: "ok", detail: "Projeto encontrado e chave aceita." });
  } catch (e) {
    checks.push({
      id: "connection",
      title: "Conexão com o Supabase",
      status: "error",
      detail: `Não foi possível falar com ${url} (${(e as Error).message}).`,
      fix: "Confira a URL, sua internet e se o projeto não está pausado no painel do Supabase (projetos grátis pausam após 7 dias sem uso).",
    });
    return checks;
  }

  // 3. migrations (uma verificação por arquivo)
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const probes: { file: string; run: () => PromiseLike<{ error: { code?: string } | null }> }[] = [
    { file: "20261008000100_core_schema.sql", run: () => sb.from("accounts").select("id").limit(1) },
    { file: "20261008000300_functions.sql", run: () => sb.rpc("seed_default_categories", { p_user: "00000000-0000-0000-0000-000000000000" }) },
    { file: "20261008000400_integrity_rpc.sql", run: () => sb.rpc("load_demo_data", { p_account_name: "x", p_institution: "x", p_today: "2026-01-01" }) },
    { file: "20261009000500_card_images.sql", run: () => sb.rpc("remove_card", { p_card: "00000000-0000-0000-0000-000000000000" }) },
    { file: "20261009000600_ensure_profile.sql", run: () => sb.rpc("ensure_profile") },
    { file: "20261009000700_accounts_entries.sql", run: () => sb.rpc("delete_entry", { p_entry: "00000000-0000-0000-0000-000000000000" }) },
    { file: "20261009000800_delete_purchase.sql", run: () => sb.rpc("delete_purchase", { p_purchase: "00000000-0000-0000-0000-000000000000" }) },
    { file: "20261009000900_reimbursements.sql", run: () => sb.rpc("add_reimbursement", { p_purchase: null, p_entry: null, p_account: null, p_amount_cents: 1, p_date: "2026-01-01", p_counterparty: "x" }) },
    { file: "20261009001000_categories.sql", run: () => sb.rpc("remove_category", { p_category: "00000000-0000-0000-0000-000000000000" }) },
  ];
  const missing: string[] = [];
  // sem erro ao ler como anônimo = o arquivo de segurança (RLS) não foi aplicado
  const anonRead = await sb.from("accounts").select("id").limit(1);
  if (!anonRead.error) missing.push("20261008000200_rls.sql");
  for (const p of probes) {
    try {
      const { error } = await p.run();
      const r = existsFromError(error?.code);
      if (r === "missing") missing.push(p.file);
    } catch {
      missing.push(p.file);
    }
  }
  checks.push(
    missing.length === 0
      ? { id: "migrations", title: "Tabelas do NEXO no banco", status: "ok", detail: "As 10 migrations foram aplicadas." }
      : {
          id: "migrations",
          title: "Tabelas do NEXO no banco",
          status: "error",
          detail: `Faltam: ${[...new Set(missing)].sort().join(", ")}.`,
          fix: "No Supabase, abra SQL Editor → New query, cole o conteúdo de cada arquivo da pasta supabase/migrations que falta, em ordem, e clique em Run.",
        },
  );

  // 4. confirmação de e-mail
  if (settings?.external?.email === false) {
    checks.push({
      id: "email",
      title: "Login por e-mail e senha",
      status: "error",
      detail: "O provedor de e-mail está desligado no projeto.",
      fix: "Ative em Authentication → Sign In / Providers → Email.",
    });
  } else if (settings?.disable_signup) {
    checks.push({
      id: "email",
      title: "Login por e-mail e senha",
      status: "warning",
      detail: "Novos cadastros estão bloqueados no projeto.",
      fix: "Para criar sua conta, ative \"Allow new users to sign up\" em Authentication → Sign In / Providers.",
    });
  } else if (settings && !settings.mailer_autoconfirm) {
    checks.push({
      id: "email",
      title: "Login por e-mail e senha",
      status: "warning",
      detail: "A confirmação de e-mail está ligada: depois de criar a conta, é preciso clicar no link enviado antes de entrar. O envio grátis do Supabase tem limite de poucos e-mails por hora.",
      fix: "Para uso pessoal, desligue \"Confirm email\" em Authentication → Sign In / Providers → Email. Se mantiver, adicione http://localhost:3000/auth/confirm em Authentication → URL Configuration → Redirect URLs.",
    });
  } else {
    checks.push({ id: "email", title: "Login por e-mail e senha", status: "ok", detail: "Ativo, sem confirmação obrigatória: dá para criar a conta e entrar direto." });
  }

  // 5. chave secreta (opcional) e bucket de imagens
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) {
    checks.push({
      id: "secret",
      title: "Chave secreta (opcional)",
      status: "skipped",
      detail: "Sem SUPABASE_SERVICE_ROLE_KEY: tudo funciona, exceto o botão \"Excluir conta\". Também não dá para conferir daqui o espaço das imagens dos cartões.",
    });
  } else {
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: usersErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (usersErr) {
      checks.push({ id: "secret", title: "Chave secreta (opcional)", status: "error", detail: "A chave em SUPABASE_SERVICE_ROLE_KEY foi recusada.", fix: "Copie a \"service_role\" ou \"Secret key\" do mesmo projeto." });
    } else {
      checks.push({ id: "secret", title: "Chave secreta (opcional)", status: "ok", detail: "Aceita (usada só no servidor para excluir a conta)." });
      const { error: bucketErr } = await admin.storage.getBucket("card-images");
      checks.push(
        bucketErr
          ? { id: "bucket", title: "Espaço das imagens dos cartões", status: "error", detail: "O bucket card-images não existe.", fix: "Rode o arquivo supabase/migrations/20261009000500_card_images.sql no SQL Editor." }
          : { id: "bucket", title: "Espaço das imagens dos cartões", status: "ok", detail: "Bucket privado card-images encontrado." },
      );
    }
  }

  return checks;
}
