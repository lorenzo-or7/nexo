import { expect, test } from "@playwright/test";

/**
 * [17] Persistência após logout e novo login — contra um projeto Supabase de TESTE.
 * Requer E2E_EMAIL e E2E_PASSWORD de um usuário já confirmado.
 */
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(!email || !password, "Defina E2E_EMAIL e E2E_PASSWORD para rodar contra o Supabase");

test("[17][18] dados e tema persistem após sair e entrar de novo", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/configuracoes");
  const name = `Teste ${Date.now()}`;
  await page.getByLabel("Nome").fill(name);
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await expect(page.getByText("Preferências salvas.")).toBeVisible();
  const theme = await page.locator("html").getAttribute("data-theme");
  await page.getByRole("button", { name: /Ativar modo/ }).first().click();
  const toggled = theme === "dark" ? "light" : "dark";
  await expect(page.locator("html")).toHaveAttribute("data-theme", toggled);
  await page.waitForTimeout(800);

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/entrar/);
  await page.context().clearCookies(); // simula outro dispositivo: tema vem do perfil

  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.goto("/configuracoes");
  await expect(page.getByLabel("Nome")).toHaveValue(name);
  await expect(page.locator("html")).toHaveAttribute("data-theme", toggled);
});
