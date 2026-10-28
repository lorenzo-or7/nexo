import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reautenticação da limpeza completa: a identidade vem SEMPRE da sessão validada no servidor,
 * nunca do formulário; a RPC não recebe id de usuário; sem a frase e a senha, nada é executado.
 */
const calls = { signIn: [] as unknown[], rpc: [] as { fn: string; args: unknown }[], revalidated: 0 };
let signInError: { message: string } | null = null;
let rpcError: { message: string } | null = null;
let sessionUser: { id: string; email: string | null } | null = { id: "user-sessao", email: "sessao@nexo.test" };

vi.mock("next/cache", () => ({ revalidatePath: () => void calls.revalidated++ }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));
vi.mock("@/lib/data/finance", () => ({ loadProfile: async () => ({ timezone: "America/Sao_Paulo" }) }));
vi.mock("@/lib/supabase/server", () => ({
  requireUser: async () => {
    if (!sessionUser) throw new Error("Sessão expirada. Entre novamente.");
    return {
      user: sessionUser,
      supabase: {
        auth: { signInWithPassword: async (a: unknown) => (calls.signIn.push(a), { error: signInError }) },
        rpc: async (fn: string, args: unknown) => (calls.rpc.push({ fn, args }), { error: rpcError }),
      },
    };
  },
}));

const { clearAllData, clearEntries } = await import("../actions");
const { CLEAR_ALL_PHRASE, CLEAR_ENTRIES_PHRASE } = await import("@/lib/data-management");

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  calls.signIn.length = 0;
  calls.rpc.length = 0;
  calls.revalidated = 0;
  signInError = null;
  rpcError = null;
  sessionUser = { id: "user-sessao", email: "sessao@nexo.test" };
});

describe("clearAllData (limpar tudo)", () => {
  it("sem a frase exata não reautentica nem apaga", async () => {
    for (const confirm of ["", "excluir meus dados", "EXCLUIR MEUS DADOS ", "EXCLUIR"]) {
      const r = await clearAllData(undefined, form({ confirm, password: "x" }));
      expect(r).toMatchObject({ ok: false });
    }
    expect(calls.signIn).toHaveLength(0);
    expect(calls.rpc).toHaveLength(0);
  });

  it("sem senha não apaga", async () => {
    const r = await clearAllData(undefined, form({ confirm: CLEAR_ALL_PHRASE }));
    expect(r).toMatchObject({ ok: false });
    expect(calls.signIn).toHaveLength(0);
    expect(calls.rpc).toHaveLength(0);
  });

  it("senha errada: nada é apagado", async () => {
    signInError = { message: "Invalid login credentials" };
    const r = await clearAllData(undefined, form({ confirm: CLEAR_ALL_PHRASE, password: "errada" }));
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("Nada foi apagado") });
    expect(calls.signIn).toHaveLength(1);
    expect(calls.rpc).toHaveLength(0);
  });

  it("a senha é conferida contra o e-mail da SESSÃO, ignorando e-mail/id enviados no formulário", async () => {
    await expect(
      clearAllData(undefined, form({ confirm: CLEAR_ALL_PHRASE, password: "certa", email: "vitima@nexo.test", user_id: "outra-conta", id: "outra-conta" })),
    ).rejects.toMatchObject({ to: "/?limpo=1" });
    expect(calls.signIn).toEqual([{ email: "sessao@nexo.test", password: "certa" }]);
    // a RPC não leva nenhum identificador: o banco usa o usuário do JWT
    expect(calls.rpc).toEqual([{ fn: "clear_all_financial_data", args: undefined }]);
    expect(JSON.stringify(calls)).not.toContain("vitima");
    expect(JSON.stringify(calls)).not.toContain("outra-conta");
  });

  it("falha no banco: avisa que nada foi apagado e não redireciona", async () => {
    rpcError = { message: "boom" };
    const r = await clearAllData(undefined, form({ confirm: CLEAR_ALL_PHRASE, password: "certa" }));
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("Nada foi apagado") });
  });

  it("sessão sem e-mail ou expirada: recusa", async () => {
    sessionUser = { id: "u", email: null };
    expect(await clearAllData(undefined, form({ confirm: CLEAR_ALL_PHRASE, password: "x" }))).toMatchObject({ ok: false });
    sessionUser = null;
    await expect(clearAllData(undefined, form({ confirm: CLEAR_ALL_PHRASE, password: "x" }))).rejects.toThrow(/Sessão expirada/);
    expect(calls.rpc).toHaveLength(0);
  });
});

describe("clearEntries (limpar lançamentos)", () => {
  it("exige a frase exata e chama só a RPC do usuário da sessão", async () => {
    expect(await clearEntries(undefined, form({ confirm: "limpar" }))).toMatchObject({ ok: false });
    expect(calls.rpc).toHaveLength(0);
    const r = await clearEntries(undefined, form({ confirm: CLEAR_ENTRIES_PHRASE, user_id: "outra-conta" }));
    expect(r).toMatchObject({ ok: true });
    expect(calls.rpc).toHaveLength(1);
    expect(calls.rpc[0].fn).toBe("clear_my_entries");
    expect(JSON.stringify(calls.rpc[0].args)).not.toContain("outra-conta");
  });
});
