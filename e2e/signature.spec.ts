import { expect, test } from "@playwright/test";
import { PALETTES } from "../src/lib/theme/palettes";

/**
 * Marca OR7 (DeveloperSignature), aviso de privacidade e afirmações de segurança.
 * Precisa de servidor com Supabase configurado (qualquer URL/chave serve: nenhum login é feito).
 */
const OR7 = "img[alt^='Or7']";
const PAGES = ["/", "/entrar", "/cadastro", "/dev/preview", "/dev/preview/contas"];

for (const path of PAGES) {
  test(`[or7] assinatura visível, nítida e proporcional em ${path}`, async ({ page }) => {
    await page.goto(path);
    const img = page.locator(OR7).first();
    await img.scrollIntoViewIfNeeded();
    await expect(img).toBeVisible();
    // a imagem é lazy e, no servidor de desenvolvimento, o 1º pedido ao otimizador (/_next/image) pode
    // levar vários segundos: espera o carregamento em vez de ler naturalWidth no instante em que ela aparece
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
    const m = await img.evaluate((el: HTMLImageElement) => ({ nw: el.naturalWidth, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, filter: getComputedStyle(el).filter }));
    expect(m.nw).toBeGreaterThan(0);
    expect(m.filter).toBe("none");
    expect(Math.abs(m.w / m.h - 1200 / 225)).toBeLessThan(0.08); // sem distorção
  });
}

test("[or7] sem sobreposição com a navegação inferior nas páginas internas (celular)", async ({ page, isMobile }) => {
  test.skip(!isMobile, "só no celular");
  await page.goto("/dev/preview");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const img = page.locator(OR7).first();
  const nav = page.locator("nav.fixed[aria-label='Principal']");
  const [a, n] = await Promise.all([img.boundingBox(), nav.boundingBox()]);
  expect(a!.y + a!.height).toBeLessThanOrEqual(n!.y + 1);
});

test("[or7] aparência idêntica em todos os modos e paletas (sem filtros)", async ({ browser }) => {
  for (const p of PALETTES) {
    for (const mode of ["dark", "light"]) {
      const ctx = await browser.newContext();
      await ctx.addCookies([
        { name: "nexo-theme", value: mode, url: "http://localhost:3100" },
        { name: "nexo-palette", value: p.id, url: "http://localhost:3100" },
      ]);
      const page = await ctx.newPage();
      await page.goto("/entrar");
      const info = await page.locator(OR7).first().evaluate((el: HTMLImageElement) => {
        const cs = getComputedStyle(el);
        return { filter: cs.filter, opacity: cs.opacity, mix: cs.mixBlendMode, bg: cs.backgroundColor, ok: el.complete && el.naturalWidth > 0 };
      });
      expect(info, `${p.id}/${mode}`).toEqual({ filter: "none", opacity: "1", mix: "normal", bg: "rgb(0, 0, 0)", ok: true });
      await ctx.close();
    }
  }
});

for (const path of ["/entrar", "/cadastro"]) {
  test(`[privacidade] aviso de privacidade/LGPD em ${path}, sem links inventados nem overflow`, async ({ page }) => {
    await page.goto(path);
    const notice = page.getByRole("complementary", { name: "Sua privacidade importa." });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("LGPD");
    // documentos legais ainda não existem: nenhum link para eles
    await expect(notice.getByRole("link")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test(`[privacidade] formulário de ${path} segue íntegro`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.locator("input[type=password]")).toHaveAttribute("autocomplete", path === "/entrar" ? "current-password" : "new-password");
    await expect(page.getByRole("button", { name: path === "/entrar" ? "Entrar" : "Criar conta" })).toBeVisible();
  });
}

test("[segurança] nenhuma afirmação não verificada nas páginas públicas", async ({ page }) => {
  const banned = /100\s?%\s?seguro|\bISO\s?27001|\bPCI[\s-]?DSS|inviolável|criptografia de ponta|à prova de|\bselo\b/i;
  for (const path of ["/", "/entrar", "/cadastro"]) {
    await page.goto(path);
    const text = await page.locator("body").innerText();
    expect(text, path).not.toMatch(banned);
  }
});
