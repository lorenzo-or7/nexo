import { expect, test } from "@playwright/test";

/**
 * Página inicial pública. Rodam contra o servidor de desenvolvimento (sem login):
 * a raiz sem sessão mostra a landing e as rotas protegidas continuam protegidas.
 */
test("[landing] raiz pública com título, CTAs e rotas reais de login e cadastro", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Seu dinheiro.");
  await expect(page.getByRole("link", { name: "Começar agora" })).toHaveAttribute("href", "/cadastro");
  await expect(page.getByRole("link", { name: "Criar minha conta" })).toHaveAttribute("href", "/cadastro");
  await expect(page).toHaveTitle(/NEXO/);
  await expect(page.locator("link[rel=canonical]")).toHaveCount(1);
});

test("[landing] login e cadastro continuam funcionando e rotas protegidas seguem protegidas", async ({ page }) => {
  expect((await page.goto("/entrar"))?.status()).toBe(200);
  expect((await page.goto("/cadastro"))?.status()).toBe(200);
  await page.goto("/contas");
  await expect(page).toHaveURL(/\/entrar/);
  await page.goto("/configuracoes");
  await expect(page).toHaveURL(/\/entrar/);
});

test("[landing] robots e sitemap públicos", async ({ request }) => {
  expect((await request.get("/robots.txt")).status()).toBe(200);
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("/cadastro");
});

test("[landing] simulador: inicial 6.300, negativo, zerado e sem enviar nada", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") writes.push(`${r.method()} ${r.url()}`);
  });
  await page.goto("/");
  const status = page.getByRole("status");
  await page.locator("#sim-initial-n").scrollIntoViewIfNeeded();
  await expect(status).toContainText("sobe R$");
  await expect(page.getByText("R$ 6.300,00").first()).toBeVisible();

  await page.locator("#sim-initial-n").fill("1000");
  await page.locator("#sim-income-n").fill("0");
  await page.locator("#sim-expense-n").fill("3000");
  await expect(status).toContainText("cai R$ 3.000,00");
  await expect(status).toContainText("fica negativo");
  await expect(page.getByText("− R$ 3.000,00").first()).toBeVisible();

  await page.locator("#sim-initial-n").fill("0");
  await page.locator("#sim-expense-n").fill("0");
  await expect(status).toContainText("fica igual");

  // texto inválido e acima do limite são contidos
  await page.locator("#sim-initial-n").fill("abc99999999999");
  await expect(page.locator("#sim-initial-n")).toHaveValue("1000000");

  expect(writes).toEqual([]);
});

test("[landing] FAQ acessível: botões expandem e recolhem", async ({ page }) => {
  await page.goto("/");
  const btn = page.getByRole("button", { name: "Posso gerenciar mais de uma conta?" });
  await btn.scrollIntoViewIfNeeded();
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("transferir dinheiro entre as contas")).toBeVisible();
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "false");
});

test("[landing] tema claro/escuro alterna e persiste ao recarregar", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Aparência: modo e cores" }).click();
  await page.getByRole("radio", { name: "Claro" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.waitForTimeout(800); // deixa a action gravar o cookie
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("[landing] menu mobile abre, navega e fecha com Escape", async ({ page, isMobile }) => {
  test.skip(!isMobile, "só no celular");
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Abrir menu" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.getByRole("button", { name: "Fechar menu" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "Criar conta" }).last()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Abrir menu" })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("link", { name: "FAQ" }).last().click();
  await expect(page).toHaveURL(/#faq$/);
});

for (const size of [{ w: 360, h: 740 }, { w: 768, h: 1024 }, { w: 1440, h: 900 }, { w: 2200, h: 1200 }]) {
  test(`[landing] sem rolagem horizontal em ${size.w}px`, async ({ page }) => {
    await page.setViewportSize({ width: size.w, height: size.h });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}

test("[landing] não expõe segredos no HTML", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE|eyJ[A-Za-z0-9_-]{20,}\./);
});

test("[landing] seletor compacto troca modo e paleta na hora e a escolha sobrevive à navegação", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Aparência: modo e cores" }).click();
  const pop = page.getByRole("radiogroup", { name: "Cores" });
  await expect(pop.getByRole("radio")).toHaveCount(6);
  await page.getByRole("radio", { name: "Violeta" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "violeta");
  await page.getByRole("radio", { name: "Claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.keyboard.press("Escape");
  // navegar e recarregar mantém a escolha (cookie)
  await page.goto("/entrar");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "violeta");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "violeta");
});

test("[landing] seletor cabe em 320px sem rolagem horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await page.getByRole("button", { name: "Aparência: modo e cores" }).click();
  const box = await page.getByRole("radiogroup", { name: "Cores" }).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});
