import { expect, test } from "@playwright/test";

/** Detalhamento dos indicadores (demonstração, hoje = 08/10/2026). A composição precisa fechar com o card. */
test("A receber abre a lista que soma o mesmo valor do card", async ({ page }) => {
  await page.goto("/dev/preview");
  await page.getByRole("button", { name: "Ver detalhes: A receber" }).click();
  const panel = page.getByTestId("indicator-panel");
  await expect(panel.getByTestId("indicator-total")).toHaveText("R$ 1.301,67");
  await expect(panel).toContainText("2 itens");
  await expect(panel).toContainText("Prevista");
  await panel.getByRole("button", { name: "Voltar" }).click();
  await expect(panel).toBeHidden();
});

test("Faturas abertas e Fechadas a pagar detalham por cartão", async ({ page }) => {
  await page.goto("/dev/preview");
  await page.getByRole("button", { name: "Ver detalhes: Faturas abertas" }).click();
  const panel = page.getByTestId("indicator-panel");
  await expect(panel.getByTestId("indicator-total")).toHaveText("R$ 814,88");
  await expect(panel).toContainText("Nubank");
  await expect(panel.getByRole("link", { name: "Registrar pagamento" }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Ver detalhes: Fechadas a pagar" }).click();
  await expect(page.getByTestId("indicator-total")).toHaveText("R$ 544,68");
});

test("Livre para gastar mostra a memória de cálculo nos dois cenários", async ({ page }) => {
  await page.goto("/dev/preview");
  await page.getByRole("button", { name: "Ver detalhes: Livre para gastar" }).click();
  const panel = page.getByTestId("indicator-panel");
  await expect(panel.getByTestId("indicator-total")).toHaveText("R$ 263,23");
  await expect(panel.getByTestId("composition")).toContainText("Faturas de cartão");
  await expect(panel.getByTestId("composition")).toContainText("Outras receitas previstas");
  await panel.getByRole("button", { name: "Só o confirmado" }).click();
  await expect(panel.getByTestId("indicator-total")).toHaveText("-R$ 1.038,44");
});

test("Menor saldo e Saldo ao final abrem com evolução e composição", async ({ page }) => {
  await page.goto("/dev/preview");
  await page.getByRole("button", { name: /Ver detalhes: Menor saldo previsto/ }).click();
  await expect(page.getByRole("img", { name: "Evolução do saldo no período" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Ver detalhes: Saldo ao final do período/ }).click();
  await expect(page.getByTestId("indicator-total")).toHaveText("R$ 263,23");
});

test("saldo em conta lista as contas e o painel não cria rolagem horizontal no celular", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/dev/preview");
  await page.getByRole("button", { name: "Ver detalhes: Saldo em conta hoje" }).click();
  await expect(page.getByTestId("indicator-panel")).toContainText("Movimentos");
  const over = await page.evaluate(() => {
    const el = document.querySelector("[data-testid=indicator-panel]")!.parentElement!;
    return el.scrollWidth - el.clientWidth;
  });
  expect(over).toBeLessThanOrEqual(0);
});
