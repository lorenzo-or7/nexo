import { beforeEach, describe, expect, it, vi } from "vitest";

/** Exclusão definitiva da conta: frase própria + aceite + senha da SESSÃO; o alvo é sempre o usuário da sessão. */
const calls = { signIn: [] as unknown[], deleted: [] as string[], signedOut: 0 };
let signInError: { message: string } | null = null;
let deleteError: { message: string } | null = null;
let adminAvailable = true;
let sessionUser: { id: string; email: string | null } | null = { id: "user-sessao", email: "sessao@nexo.test" };

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (!adminAvailable) throw new Error("sem chave");
    return { auth: { admin: { deleteUser: async (id: string) => (calls.deleted.push(id), { error: deleteError }) } } };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  requireUser: async () => {
    if (!sessionUser) throw new Error("Sessão expirada. Entre novamente.");
    return {
      user: sessionUser,
      supabase: {
        auth: {
          signInWithPassword: async (a: unknown) => (calls.signIn.push(a), { error: signInError }),
          signOut: async () => void calls.signedOut++,
        },
      },
    };
  },
}));

const { deleteAccount } = await import("../actions");
const { DELETE_ACCOUNT_PHRASE } = await import("@/lib/data-management");

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const ok = { confirm: DELETE_ACCOUNT_PHRASE, understood: "on", password: "certa" };

beforeEach(() => {
  calls.signIn.length = 0;
  calls.deleted.length = 0;
  calls.signedOut = 0;
  signInError = null;
  deleteError = null;
  adminAvailable = true;
  sessionUser = { id: "user-sessao", email: "sessao@nexo.test" };
});

describe("deleteAccount", () => {
  it("recusa sem a frase exata (a antiga 'EXCLUIR' não vale), sem aceite ou sem senha — e nem reautentica", async () => {
    for (const bad of [{ ...ok, confirm: "EXCLUIR" }, { ...ok, confirm: "excluir minha conta" }, { ...ok, understood: "" }, { ...ok, password: "" }]) {
      const f = { ...bad } as Record<string, string>;
      if (!f.understood) delete f.understood;
      expect(await deleteAccount(undefined, form(f))).toMatchObject({ ok: false });
    }
    expect(calls.signIn).toHaveLength(0);
    expect(calls.deleted).toHaveLength(0);
  });

  it("senha errada: nada é apagado", async () => {
    signInError = { message: "Invalid login credentials" };
    expect(await deleteAccount(undefined, form(ok))).toMatchObject({ ok: false, error: expect.stringContaining("Nada foi apagado") });
    expect(calls.deleted).toHaveLength(0);
  });

  it("apaga o usuário DA SESSÃO, conferindo a senha contra o e-mail da sessão, e ignora e-mail/id do formulário", async () => {
    await expect(deleteAccount(undefined, form({ ...ok, email: "vitima@nexo.test", user_id: "outra", id: "outra" }))).rejects.toMatchObject({ to: "/entrar" });
    expect(calls.signIn).toEqual([{ email: "sessao@nexo.test", password: "certa" }]);
    expect(calls.deleted).toEqual(["user-sessao"]);
    expect(calls.signedOut).toBe(1);
  });

  it("sem chave administrativa, sessão expirada, sem e-mail ou falha do Auth: nada é apagado", async () => {
    adminAvailable = false;
    expect(await deleteAccount(undefined, form(ok))).toMatchObject({ ok: false });
    adminAvailable = true;
    sessionUser = { id: "u", email: null };
    expect(await deleteAccount(undefined, form(ok))).toMatchObject({ ok: false });
    sessionUser = { id: "u", email: "a@b.c" };
    deleteError = { message: "falhou" };
    expect(await deleteAccount(undefined, form(ok))).toMatchObject({ ok: false, error: expect.stringContaining("Nada foi apagado") });
    expect(calls.signedOut).toBe(0);
    sessionUser = null;
    await expect(deleteAccount(undefined, form(ok))).rejects.toThrow(/Sessão expirada/);
    expect(calls.deleted).toEqual(["u"]); // só a tentativa que chegou ao Auth (que falhou)
  });
});
