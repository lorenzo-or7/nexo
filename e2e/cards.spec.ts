import { expect, test } from "@playwright/test";

/** Tela de cartões (pré-visualização sem Supabase): formulário e prévia ao vivo. */
test("adicionar cartão: prévia acompanha o formulário", async ({ page }) => {
  await page.goto("/dev/preview/cartoes");
  await page.getByRole("button", { name: "Adicionar cartão" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Adicionar cartão" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("combobox", { name: "Instituição" }).click();
  await page.getByRole("option", { name: "Santander" }).click();
  await dialog.getByLabel("Nome do cartão", { exact: true }).fill("Santander Free");
  await dialog.getByLabel("Final do cartão (opcional)").fill("12ab345");
  await expect(dialog.getByLabel("Final do cartão (opcional)")).toHaveValue("1234"); // só dígitos, no máximo 4
  await expect(dialog.getByRole("img", { name: /Cartão Santander Free, Santander, final 1234/ })).toBeVisible();
  await expect(dialog.locator("input[name=color]")).toHaveValue("#EC0000");

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
});

test("excluir pede confirmação e explica o arquivamento", async ({ page }) => {
  await page.goto("/dev/preview/cartoes");
  await page.getByRole("button", { name: "Excluir Nubank Ultravioleta" }).click();
  const dialog = page.getByRole("dialog", { name: /Excluir Nubank Ultravioleta/ });
  await expect(dialog.getByText(/arquivado/)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
});

test("cartões sem rolagem horizontal", async ({ page }) => {
  await page.goto("/dev/preview/cartoes");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("faturas: estados, pagamentos já feitos e modal de registrar pagamento", async ({ page }) => {
  await page.goto("/dev/preview/cartoes");
  const rows = page.getByTestId("invoice-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Parcialmente paga");
  await expect(rows.first()).toContainText("R$ 814,88"); // falta
  await expect(rows.first()).toContainText("R$ 400,00"); // pago
  await expect(rows.nth(1)).toContainText("Fechada");
  await rows.first().getByRole("button", { name: "Registrar pagamento" }).click();
  const dlg = page.getByRole("dialog", { name: "Registrar pagamento" });
  await expect(dlg).toContainText("Valor da fatura");
  await expect(dlg).toContainText("Falta pagar");
  await expect(dlg.getByLabel("Valor a pagar")).toHaveValue("R$ 814,88");
  await dlg.getByRole("button", { name: "Pagar tudo" }).click();
  await expect(dlg.getByRole("combobox")).toContainText("Conta principal");
  await dlg.getByRole("button", { name: "Cancelar" }).click();
  await rows.first().getByRole("button", { name: /Estornar pagamento/ }).click();
  await expect(page.getByRole("dialog", { name: "Estornar este pagamento?" })).toContainText("só pode ser feito uma vez");
});

test("faturas: sem rolagem horizontal no celular", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/dev/preview/cartoes");
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});
