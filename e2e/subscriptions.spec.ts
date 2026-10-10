import { expect, test } from "@playwright/test";

test("assinaturas: resumo, abas, renovação próxima e formulário", async ({ page }) => {
  await page.goto("/dev/preview/assinaturas");
  await expect(page.getByRole("heading", { name: "Assinaturas", level: 1 })).toBeVisible();
  // ativas: Netflix 44,90 + Spotify 21,90 + ChatGPT 110,00 + domínio 60,00/12 = 181,80
  const summary = page.getByTestId("subs-summary");
  await expect(summary).toContainText("R$ 181,80");
  await expect(summary).toContainText("R$ 2.181,60");
  await expect(page.getByTestId("subscription")).toHaveCount(4);
  // Netflix vence 11/10 (hoje é 09/10): alerta de renovação
  await expect(page.getByText("Renova em breve:")).toBeVisible();
  await expect(page.getByTestId("subscription").first()).toContainText("Netflix");
  await expect(page.getByTestId("subscription").first()).toContainText("11/10/2026");
  await expect(page.getByTestId("subscription").first()).toContainText("2 cobranças");

  await page.getByRole("tab", { name: /Pausadas/ }).click();
  await expect(page.getByTestId("subscription")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Retomar Academia" })).toBeVisible();
  await page.getByRole("tab", { name: /Canceladas/ }).click();
  await expect(page.getByRole("button", { name: "Reativar Globoplay" })).toBeVisible();

  await page.getByRole("tab", { name: /Ativas/ }).click();
  await page.getByRole("button", { name: "Editar Spotify" }).click();
  const dialog = page.getByRole("dialog", { name: "Editar Spotify" });
  await expect(dialog.getByLabel("Nome")).toHaveValue("Spotify");
  await expect(dialog.getByLabel("Valor")).toHaveValue("21,90");
  await expect(dialog.getByRole("combobox", { name: "Pago com" })).toContainText("Nubank");
  await expect(dialog.locator("input[name=next_date]")).toHaveValue("2026-10-25");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Nova assinatura" }).first().click();
  const novo = page.getByRole("dialog", { name: "Nova assinatura" });
  await novo.getByLabel("Primeira cobrança").click();
  await page.getByRole("gridcell", { name: /^1 de outubro de 2026/ }).click();
  await expect(novo.getByText(/Data no passado/)).toBeVisible();
  await expect(novo.getByRole("combobox", { name: "Frequência" })).toContainText("Mensal");
});

test("assinaturas vazias mostram como começar", async ({ page }) => {
  await page.goto("/dev/preview/assinaturas?vazio=1");
  await expect(page.getByRole("heading", { name: "Nenhuma assinatura ainda" })).toBeVisible();
});
