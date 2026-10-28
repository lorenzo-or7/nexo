import { expect, test } from "@playwright/test";

/** Barra inferior e páginas principais sem estourar a largura (320 a 1024 px). */
const WIDTHS = [320, 360, 375, 390, 414, 430, 768, 1024];
const PAGES = ["/dev/preview", "/dev/preview/cartoes", "/dev/preview/renda-fixa", "/dev/preview/contas-fixas", "/dev/preview/assinaturas", "/dev/preview/contas", "/dev/preview/categorias", "/dev/preview/lancamentos", "/dev/preview/aparencia"];

for (const w of WIDTHS) {
  test(`largura ${w}px: barra inferior cabe e as telas não têm rolagem horizontal`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    for (const url of PAGES) {
      await page.goto(url);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `${url} @${w}`).toBeLessThanOrEqual(0);
      if (w < 1024) {
        const nav = page.getByRole("navigation", { name: "Principal" });
        await expect(nav).toBeVisible();
        const boxes = await nav.locator("a, button").evaluateAll((els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect();
            return { l: r.left, r: r.right, w: r.width, h: r.height, sw: (e as HTMLElement).scrollWidth, cw: (e as HTMLElement).clientWidth };
          }),
        );
        expect(boxes.length).toBe(5);
        for (const b of boxes) {
          expect(b.l).toBeGreaterThanOrEqual(-0.5);
          expect(b.r).toBeLessThanOrEqual(w + 0.5);
          expect(b.w).toBeGreaterThanOrEqual(44);
          expect(b.h).toBeGreaterThanOrEqual(44);
          expect(b.sw).toBeLessThanOrEqual(b.cw + 1); // rótulo não vaza do botão
        }
      }
    }
  });
}
