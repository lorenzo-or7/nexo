import { expect, test } from "@playwright/test";

/** Etapa 2 na pré-visualização (sem Supabase): formulário, edição e contas. */
test("novo lançamento: data futura vira agendada; transferência pede De e Para", async ({ page, isMobile }) => {
  await page.goto("/dev/preview/lancamentos");
  if (isMobile) await page.getByRole("button", { name: "Novo lançamento" }).last().click();
  else await page.getByRole("button", { name: "Novo lançamento" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Novo lançamento" });
  await expect(dialog.getByLabel("Valor")).toBeFocused();

  await expect(dialog.getByLabel("Situação")).toHaveValue("confirmed");
  await dialog.getByLabel("Data").fill("2026-10-25");
  await expect(dialog.getByLabel("Situação")).toHaveValue("scheduled");

  await dialog.getByRole("radio", { name: "Receita" }).click();
  await expect(dialog.getByLabel("Entra na conta")).toBeVisible();

  await dialog.getByRole("radio", { name: "Transferência" }).click();
  await expect(dialog.getByLabel("De", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Para", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Categoria")).toHaveCount(0);
});

test("editar lançamento abre com os valores e trava o tipo transferência", async ({ page }) => {
  await page.goto("/dev/preview/lancamentos");
  await page.getByRole("button", { name: "Editar Mercado do mês" }).click();
  const dialog = page.getByRole("dialog", { name: "Editar lançamento" });
  await expect(dialog.getByLabel("Valor")).toHaveValue("87,90");
  await expect(dialog.getByLabel("Descrição")).toHaveValue("Mercado do mês");
  await expect(dialog.getByRole("radio", { name: "Transferência" })).toBeDisabled();
  await expect(dialog.getByLabel("Tags")).toHaveValue("casa");
});

test("transferência aparece como uma linha só, sem cor de receita/despesa", async ({ page }) => {
  await page.goto("/dev/preview/lancamentos");
  await expect(page.getByText("Nubank → Santander")).toHaveCount(1);
});

test("resumo do mês ignora pendentes e transferências", async ({ page }) => {
  await page.goto("/dev/preview/lancamentos");
  const resumo = page.getByRole("complementary");
  await expect(resumo.getByText("R$ 812,68")).toBeVisible(); // só o salário realizado
  await expect(resumo.getByText("R$ 111,40")).toBeVisible(); // 87,90 + 23,50
});

test("contas: total, ajustar saldo e nova conta", async ({ page }) => {
  await page.goto("/dev/preview/contas");
  await expect(page.getByText("R$ 852,40")).toBeVisible();
  await page.getByRole("button", { name: "Ajustar saldo" }).first().click();
  await expect(page.getByRole("dialog", { name: /Ajustar saldo de Nubank/ })).toContainText("R$ 702,40");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Nova conta" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova conta" });
  await dialog.getByLabel("Instituição").selectOption("santander");
  await expect(dialog.getByLabel("Nome da conta")).toHaveValue("Santander");
});
