import { expect, test } from "@playwright/test";

/**
 * [16] Responsividade e [18] tema. Rodam contra o servidor de desenvolvimento.
 * Fluxos com login (persistência após logout/login com Supabase real) ficam em
 * e2e/auth.spec.ts e exigem E2E_EMAIL/E2E_PASSWORD de um projeto de teste.
 */
const PAGES = ["/entrar", "/cadastro", "/recuperar-senha", "/dev/preview", "/dev/preview?h=90", "/dev/preview/contas", "/dev/preview/contas-fixas", "/dev/preview/lancamentos", "/dev/preview/lancamentos?tipo=pending"];

for (const path of PAGES) {
  test(`[16] sem rolagem horizontal em ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("[16] navegação: sidebar no desktop, barra inferior no celular", async ({ page, isMobile }) => {
  await page.goto("/dev/preview");
  const bottom = page.locator("nav.fixed[aria-label='Principal']");
  const side = page.locator("aside nav[aria-label='Principal']");
  if (isMobile) {
    await expect(bottom).toBeVisible();
    await expect(side).toBeHidden();
    const box = await bottom.getByRole("link").first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44); // área de toque confortável
  } else {
    await expect(side).toBeVisible();
    await expect(bottom).toBeHidden();
  }
});

test("[18] alternar o tema troca as cores e persiste após recarregar", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/entrar");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(darkBg).toBe("rgb(36, 17, 39)"); // #241127 domina o fundo no modo escuro

  await page.getByRole("button", { name: "Ativar modo claro" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect.poll(async () => (await context.cookies()).find((c) => c.name === "nexo-theme")?.value).toBe("light");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.goto("/cadastro"); // vale em todas as páginas
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Ativar modo escuro" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
});

test("dashboard mostra os valores calculados do cenário demonstrativo", async ({ page }) => {
  await page.goto("/dev/preview");
  await expect(page.getByText("Livre para gastar até 31/10/2026")).toBeVisible();
  await expect(page.getByText("R$ 263,23").first()).toBeVisible();
  await expect(page.getByText("R$ 321,12").first()).toBeVisible();
  await expect(page.getByText("Fatura Santander")).toBeVisible();
});

test("rotas privadas redirecionam para o login", async ({ page }) => {
  await page.goto("/configuracoes");
  await expect(page).toHaveURL(/\/entrar/);
});
