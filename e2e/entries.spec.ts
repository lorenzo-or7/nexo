import { expect, test } from "@playwright/test";

/** Etapa 2 na pré-visualização (sem Supabase): formulário, edição e contas. */
test("novo lançamento: data futura vira agendada; transferência pede De e Para", async ({ page, isMobile }) => {
  await page.goto("/dev/preview/lancamentos");
  if (isMobile) await page.getByRole("button", { name: "Novo lançamento" }).last().click();
  else await page.getByRole("button", { name: "Novo lançamento" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Novo lançamento" });
  await expect(dialog.getByLabel("Valor")).toBeFocused();

  const status = dialog.locator("input[name=status]");
  await expect(status).toHaveValue("confirmed");
  await dialog.getByLabel("Data").fill("2026-10-25");
  await expect(status).toHaveValue("scheduled");
  await expect(dialog.getByRole("combobox", { name: "Situação" })).toContainText("Agendada");

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

test("resumo do mês ignora pendentes e transferências e inclui compras no crédito", async ({ page }) => {
  await page.goto("/dev/preview/lancamentos");
  const resumo = page.getByRole("complementary");
  await expect(resumo.getByText("R$ 812,68")).toBeVisible(); // só o salário realizado
  await expect(resumo.getByText("R$ 411,40")).toBeVisible(); // 87,90 + 23,50 + compra no crédito de 300,00
});

test("contas: total, ajustar saldo e nova conta", async ({ page }) => {
  await page.goto("/dev/preview/contas");
  await expect(page.getByText("R$ 852,40")).toBeVisible();
  await page.getByRole("button", { name: "Ajustar saldo" }).first().click();
  await expect(page.getByRole("dialog", { name: /Ajustar saldo de Nubank/ })).toContainText("R$ 702,40");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Nova conta" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova conta" });
  await dialog.getByRole("combobox", { name: "Instituição" }).click();
  await page.getByRole("option", { name: "Santander" }).click();
  await expect(dialog.getByLabel("Nome da conta")).toHaveValue("Santander");
});

test("forma de pagamento crédito: escolhe cartão, parcelas e mostra a fatura", async ({ page }) => {
  await page.goto("/dev/preview/lancamentos");
  await page.getByRole("button", { name: "Novo lançamento" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Novo lançamento" });
  await dialog.getByLabel("Valor").fill("100,00");
  await dialog.getByRole("combobox", { name: "Forma de pagamento" }).click();
  await page.getByRole("option", { name: /Crédito/ }).click();
  await expect(dialog.getByRole("combobox", { name: "Cartão" })).toContainText("Nubank Ultravioleta");
  await expect(dialog.getByRole("combobox", { name: "Sai da conta" })).toHaveCount(0);
  await dialog.getByRole("combobox", { name: "Parcelas" }).click();
  await page.getByRole("option", { name: "3x", exact: true }).click();
  await expect(dialog.getByText(/3x de R\$ 33,34/)).toBeVisible();
  await expect(dialog.getByText(/a última de R\$ 33,33/)).toBeVisible();
  await expect(dialog.getByText(/fatura de out\/2026/)).toBeVisible();
});

test("receita não oferece crédito", async ({ page }) => {
  await page.goto("/dev/preview/lancamentos");
  await page.getByRole("button", { name: "Novo lançamento" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Novo lançamento" });
  await dialog.getByRole("radio", { name: "Receita" }).click();
  await dialog.getByRole("button", { name: "Mais detalhes" }).click();
  await dialog.getByRole("combobox", { name: "Forma de recebimento" }).click();
  await expect(page.getByRole("option", { name: "Pix" })).toBeVisible();
  await expect(page.getByRole("option", { name: /Crédito/ })).toHaveCount(0);
});

test("compra no crédito aparece no extrato e só pode ser excluída", async ({ page }) => {
  await page.goto("/dev/preview/lancamentos");
  await expect(page.getByText("Nubank Ultravioleta · 3x · Despesas gerais")).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar Booster box" })).toHaveCount(0);
  await page.getByRole("button", { name: "Excluir Booster box" }).click();
  await expect(page.getByRole("dialog")).toContainText("sai das faturas do cartão");
});

test("extrato mostra todos os meses; filtro de mês é opcional", async ({ page }) => {
  await page.goto("/dev/preview/lancamentos");
  await expect(page.getByRole("combobox", { name: "Mês" })).toContainText("Todos os meses");
  await expect(page.getByRole("heading", { name: "Resumo de tudo" })).toBeVisible();
  await page.getByRole("combobox", { name: "Mês" }).click();
  await page.getByRole("option", { name: "Setembro de 2026" }).click();
  await expect(page).toHaveURL(/mes=2026-09/);
  await expect(page.getByText("Nenhum lançamento em set/2026.")).toBeVisible();
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page).toHaveURL(/mes=2026-10/);
  await expect(page.getByText("Mercado do mês")).toBeVisible();
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page).not.toHaveURL(/mes=/);
});
