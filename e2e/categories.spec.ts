import { expect, test } from "@playwright/test";

test("tela de categorias: grupos, tipos, edição e arquivadas", async ({ page }) => {
  await page.goto("/dev/preview/categorias");
  await expect(page.getByRole("heading", { name: "Categorias", level: 1 })).toBeVisible();
  await expect(page.getByTestId("category-group")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Transporte" })).toBeVisible();

  await page.getByRole("tab", { name: /Receitas/ }).click();
  await expect(page.getByTestId("category-group")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Receitas" })).toBeVisible();

  // editar subcategoria abre com a principal escolhida e tipo travado
  await page.getByRole("button", { name: "Editar Salário" }).click();
  const dialog = page.getByRole("dialog", { name: "Editar subcategoria" });
  await expect(dialog.getByLabel("Nome")).toHaveValue("Salário");
  await expect(dialog.getByRole("combobox", { name: "Fica dentro de" })).toContainText("Receitas");
  await expect(dialog.getByRole("radio", { name: "Receita" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar" }).click();

  // nova subcategoria já vem dentro da principal
  await page.getByRole("button", { name: "Subcategoria" }).click();
  const novo = page.getByRole("dialog", { name: "Nova subcategoria" });
  await expect(novo.getByRole("combobox", { name: "Fica dentro de" })).toContainText("Receitas");
  await novo.getByLabel("Nome").fill("Cashback");
  await expect(novo.getByText("Receitas ›")).toBeVisible();
  await novo.getByRole("radio", { name: "Cor #2F9E44" }).click();
  await expect(novo.locator("input[name=color]")).toHaveValue("#2F9E44");
  await page.keyboard.press("Escape");

  await page.getByText(/Arquivadas \(1\)/).click();
  await expect(page.getByRole("button", { name: "Restaurar Academia antiga" })).toBeVisible();
});

test("categoria criada no próprio lançamento e filtro com atalho", async ({ page, isMobile }) => {
  await page.goto("/dev/preview/lancamentos");
  await expect(page.getByRole("link", { name: "Categorias" }).last()).toHaveAttribute("href", "/categorias");
  if (isMobile) await page.getByRole("button", { name: "Novo lançamento" }).last().click();
  else await page.getByRole("button", { name: "Novo lançamento" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Novo lançamento" });
  await dialog.getByRole("button", { name: "Criar categoria" }).click();
  const box = dialog.getByTestId("quick-category");
  await expect(box.getByLabel("Nome da nova categoria")).toBeFocused();
  // nome repetido no mesmo nível é avisado antes de ir ao servidor
  await box.getByLabel("Nome da nova categoria").fill("transporte");
  await box.getByRole("button", { name: "Criar" }).click();
  await expect(box.getByRole("alert")).toContainText("Já existe");
  await box.getByRole("button", { name: "Cancelar" }).click();
  await expect(box).toHaveCount(0);
});
