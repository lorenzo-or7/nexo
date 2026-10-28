import { expect, test } from "@playwright/test";

test("gerenciamento de dados: exportar, limpar lançamentos e limpar tudo em 3 etapas", async ({ page }) => {
  await page.goto("/dev/preview/configuracoes");
  await expect(page.getByRole("heading", { name: "Gerenciamento de dados" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Exportar tudo (JSON)" }).first()).toHaveAttribute("href", "/api/export");
  await expect(page.getByRole("link", { name: "Lançamentos (CSV)" }).first()).toHaveAttribute("href", "/api/export?formato=csv");

  // limpar lançamentos: botão só habilita com a frase exata
  await page.getByRole("button", { name: "Limpar meus lançamentos" }).click();
  const d1 = page.getByRole("dialog", { name: "Limpar meus lançamentos?" });
  await expect(d1).toContainText("Será apagado");
  await expect(d1).toContainText("Contas e cartões");
  const go1 = d1.getByRole("button", { name: "Limpar lançamentos" });
  await expect(go1).toBeDisabled();
  await d1.getByLabel(/Para confirmar, digite/).fill("limpar lançamentos");
  await expect(go1).toBeDisabled();
  await d1.getByLabel(/Para confirmar, digite/).fill("LIMPAR LANÇAMENTOS");
  await expect(go1).toBeEnabled();
  await d1.getByRole("button", { name: "Cancelar" }).click();

  // limpar tudo: 3 etapas
  await page.getByRole("button", { name: "Limpar todos os meus dados financeiros" }).click();
  const d2 = page.getByRole("dialog");
  await expect(d2).toContainText("Etapa 1 de 3");
  await expect(d2).toContainText("permanente");
  await expect(d2).toContainText("Seu login, e-mail e senha");
  await d2.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(d2).toContainText("Etapa 2 de 3");
  await expect(d2.getByRole("link", { name: "Exportar tudo (JSON)" })).toBeVisible();
  await d2.getByRole("button", { name: "Continuar sem exportar" }).click();
  await expect(d2).toContainText("Etapa 3 de 3");
  const final = d2.getByRole("button", { name: "Apagar todos os meus dados financeiros" });
  await expect(final).toBeDisabled();
  await d2.getByLabel(/Digite exatamente/).fill("EXCLUIR MEUS DADO");
  await expect(final).toBeDisabled();
  await d2.getByLabel(/Digite exatamente/).fill("EXCLUIR MEUS DADOS");
  await expect(final).toBeEnabled();
  await expect(d2.getByLabel("Sua senha atual")).toHaveAttribute("type", "password");
  // voltar não perde o controle: etapa 2 de novo
  await d2.getByRole("button", { name: "Voltar" }).click();
  await expect(d2).toContainText("Etapa 2 de 3");
});

test("gerenciamento de dados cabe em 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/dev/preview/configuracoes");
  await page.getByRole("button", { name: "Limpar todos os meus dados financeiros" }).click();
  const dlg = page.getByRole("dialog");
  const box = await dlg.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320.5);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});

test("excluir conta: só habilita com a frase própria, a senha e o aceite explícito", async ({ page }) => {
  await page.goto("/dev/preview/configuracoes");
  const form = page.getByTestId("delete-account-form");
  const submit = form.getByRole("button", { name: "Excluir conta e dados" });
  await form.scrollIntoViewIfNeeded();
  await expect(submit).toBeDisabled();
  await form.getByLabel(/Digite EXCLUIR MINHA CONTA/).fill("EXCLUIR");
  await form.getByLabel("Sua senha atual").fill("segredo");
  await form.getByRole("checkbox").check();
  await expect(submit).toBeDisabled(); // frase incompleta (a antiga "EXCLUIR" não basta)
  await form.getByLabel(/Digite EXCLUIR MINHA CONTA/).fill("EXCLUIR MINHA CONTA");
  await expect(submit).toBeEnabled();
  await form.getByRole("checkbox").uncheck();
  await expect(submit).toBeDisabled();
  await form.getByRole("checkbox").check();
  await form.getByLabel("Sua senha atual").fill("");
  await expect(submit).toBeDisabled();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});
