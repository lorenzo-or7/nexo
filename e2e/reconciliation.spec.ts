import { expect, test } from "@playwright/test";

const GERAL = "00000000-0000-4000-8000-0000000000c0";

// Mesmo mês e mesma categoria: o consumo mostrado em Lançamentos é o número do gráfico,
// e o "Despesas" do resumo (lista) fecha com ele. Compra parcelada com parcelas canceladas
// entra só pelo valor das parcelas ativas.
test("lançamentos: compra parcelada estornada e consumo fecham com o resumo", async ({ page }) => {
  await page.goto(`/dev/preview/lancamentos?mes=2026-10&tipo=expense&categoria=${GERAL}&estorno=1`);
  const row = page.getByRole("listitem").filter({ hasText: "Booster box" });
  await expect(row).toContainText("Total R$ 300,00");
  await expect(row).toContainText("conta R$ 100,00");

  const panel = page.getByTestId("consumption-panel");
  await expect(panel).toBeVisible();
  // 100,00 (1ª parcela) + 87,90 (Mercado, subcategoria) — a conta de luz agendada não aconteceu
  await expect(page.getByTestId("consumption-total")).toContainText("187,90");
  const resumo = page.locator("aside").getByText("Despesas", { exact: true }).locator("xpath=following-sibling::dd");
  await expect(resumo).toContainText("187,90");
});

test("lançamentos: sem mês e sem filtro, consumo e resumo continuam iguais; filtro de conta não mostra consumo", async ({ page }) => {
  await page.goto("/dev/preview/lancamentos?mes=2026-10&tipo=expense");
  const total = await page.getByTestId("consumption-total").innerText();
  const resumo = await page.locator("aside").getByText("Despesas", { exact: true }).locator("xpath=following-sibling::dd").innerText();
  expect(total.trim()).toBe(resumo.trim());
  await page.goto("/dev/preview/lancamentos?mes=2026-10&tipo=expense&conta=00000000-0000-4000-8000-0000000000a1");
  await expect(page.getByTestId("consumption-panel")).toHaveCount(0);
});
