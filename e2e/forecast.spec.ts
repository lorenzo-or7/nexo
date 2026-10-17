import { expect, test } from "@playwright/test";

/**
 * Tela inicial: saldo só com o confirmado × com receitas previstas, linha fixa do zero,
 * abas "A receber" e "A pagar". Dados da demonstração (hoje = 08/10/2026):
 *   com previstas  → livre R$ 263,23 (nunca fica negativo)
 *   só confirmado  → livre -R$ 1.038,44 (fica negativo em 10/10)
 *   a receber R$ 1.301,67 (2 recebimentos previstos) · a pagar R$ 1.359,56 (2 faturas)
 */
test("seletor muda o número grande e o gráfico juntos, e a escolha fica guardada", async ({ page }) => {
  await page.goto("/dev/preview");
  const free = page.getByTestId("free-to-spend");
  await expect(free).toHaveText("R$ 263,23");
  await expect(page.getByTestId("scenario-note")).toContainText("R$ 1.301,67 em receitas previstas");

  await page.getByRole("radio", { name: "Só o confirmado" }).click();
  await expect(free).toHaveText("-R$ 1.038,44");
  await expect(page.locator("p[role=alert]")).toContainText("fica negativo em 10/10/2026");
  await expect(page.locator("p[role=alert]")).toContainText("Com as receitas previstas, ele não fica negativo");
  // o gráfico acompanha: o botão "Receitas previstas" do gráfico também desliga
  await expect(page.getByRole("button", { name: "Receitas previstas" })).toHaveAttribute("aria-pressed", "false");

  // depois de recarregar, continua no cenário escolhido
  await page.reload();
  await expect(page.getByTestId("free-to-spend")).toHaveText("-R$ 1.038,44");

  // e o botão dentro do gráfico liga de volta o destaque também
  await page.getByRole("button", { name: "Receitas previstas" }).click();
  await expect(page.getByTestId("free-to-spend")).toHaveText("R$ 263,23");
  await expect(page.getByRole("radio", { name: "Com previstas" })).toHaveAttribute("aria-checked", "true");
});

test("gráfico de saldo: linha fixa do zero, zonas nomeadas e sem a opção 'Linha'", async ({ page }) => {
  await page.goto("/dev/preview");
  await expect(page.getByRole("radio", { name: "Área" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Barras" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Linha", exact: true })).toHaveCount(0);

  const zero = page.locator(".recharts-reference-line").first();
  await expect(zero).toBeVisible();
  await expect(page.getByText("▲ positivo")).toBeVisible();
  await expect(page.getByText("▼ negativo")).toBeVisible(); // o tracejado do confirmado passa do zero
  // a linha do zero fica exatamente na altura do marcador "0" do eixo
  const line = await zero.locator("line").first().boundingBox();
  const tick = await page.locator(".recharts-cartesian-axis-tick-value", { hasText: /^0$/ }).first().boundingBox();
  expect(line && tick).toBeTruthy();
  expect(Math.abs(line!.y - (tick!.y + tick!.height / 2))).toBeLessThan(3);

  // nas barras também há linha do zero
  await page.getByRole("radio", { name: "Barras" }).click();
  await expect(page.locator(".recharts-reference-line").first()).toBeVisible();
});

test("abas novas: a receber (total previsto) e a pagar (por origem)", async ({ page }) => {
  await page.goto("/dev/preview");
  await page.getByRole("radio", { name: "A receber" }).click();
  const tiles = page.locator("dl").filter({ hasText: "Total a receber" });
  await expect(tiles).toContainText("R$ 1.301,67");
  await expect(tiles).toContainText("Previsto");
  await expect(tiles).toContainText("Próximo recebimento · 09/10");
  await expect(tiles).toContainText("R$ 812,68");

  await page.getByRole("radio", { name: "A pagar" }).click();
  const pay = page.locator("dl").filter({ hasText: "Total a pagar" });
  await expect(pay).toContainText("R$ 1.359,56");
  await expect(pay).toContainText("Faturas de cartão");
  await expect(pay).toContainText("Contas fixas e assinaturas");

  // a tabela acompanha a aba
  await page.getByRole("button", { name: "Tabela" }).click();
  await expect(page.getByRole("columnheader", { name: "Faturas" })).toBeVisible();
  await page.getByRole("radio", { name: "A receber" }).click();
  await page.getByRole("button", { name: "Tabela" }).click();
  await expect(page.getByRole("columnheader", { name: "Total a receber" })).toBeVisible();
});
