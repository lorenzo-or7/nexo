import { expect, test } from "@playwright/test";

test("contas fixas: resumo, vencimentos próximos, abas e formulário", async ({ page }) => {
  await page.goto("/dev/preview/contas-fixas");
  await expect(page.getByRole("heading", { name: "Contas fixas", level: 1 })).toBeVisible();
  // ativas: condomínio 680,00 + luz 210,50 + academia 99,90 = 990,40/mês
  const summary = page.getByTestId("subs-summary");
  await expect(summary).toContainText("R$ 990,40");
  await expect(summary).toContainText("R$ 11.884,80");
  await expect(page.getByTestId("subscription")).toHaveCount(3);
  await expect(page.getByText("Vence em breve:")).toBeVisible();
  await expect(page.getByTestId("subscription").first()).toContainText("Condomínio");
  await expect(page.getByTestId("subscription").first()).toContainText("10/10/2026");

  await page.getByRole("tab", { name: /Encerradas/ }).click();
  await expect(page.getByRole("button", { name: "Reativar Internet" })).toBeVisible();
  await page.getByRole("tab", { name: /Ativas/ }).click();

  await page.getByRole("button", { name: "Nova conta fixa" }).first().click();
  const novo = page.getByRole("dialog", { name: "Nova conta fixa" });
  await expect(novo.getByLabel("Nome")).toBeVisible();
  await expect(novo.getByLabel("Primeiro vencimento")).toBeVisible();
  await expect(novo.getByRole("combobox", { name: "Frequência" })).toContainText("Mensal");
  await expect(novo.locator("input[name=kind]")).toHaveValue("bill");
  await expect(novo.getByText(/O valor muda de mês em mês/)).toBeVisible();
  await expect(novo.getByRole("button", { name: "Criar conta fixa" })).toBeVisible();
});

test("contas fixas vazias mostram como começar", async ({ page }) => {
  await page.goto("/dev/preview/contas-fixas?vazio=1");
  await expect(page.getByRole("heading", { name: "Nenhuma conta fixa ainda" })).toBeVisible();
});

test("assinaturas continuam separadas das contas fixas", async ({ page }) => {
  await page.goto("/dev/preview/assinaturas");
  await expect(page.getByRole("heading", { name: "Assinaturas", level: 1 })).toBeVisible();
  await expect(page.getByText("Condomínio")).toHaveCount(0);
});
