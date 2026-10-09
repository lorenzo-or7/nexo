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
