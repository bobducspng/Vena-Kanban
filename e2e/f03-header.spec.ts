import { test, expect } from "@playwright/test";

// Sessão semeada = ana@empresa.com (ver global-setup).
const EU = "Ana Souza";

test.describe("Header — identidade + logout", () => {
  // BUG-002: o header deve mostrar o usuário logado, não o demo do seed.
  test("mostra o usuário autenticado", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu do usuário" }).click();
    await expect(page.getByText(EU)).toBeVisible();
  });

  // BUG-006: deve existir um "Sair" que encerra a sessão e volta ao login.
  test("logout encerra a sessão e vai ao /login", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu do usuário" }).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Sessão encerrada: voltar a uma rota protegida redireciona ao login.
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});
