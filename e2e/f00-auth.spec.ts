import { test, expect } from "@playwright/test";

// Regressão do BUG-001: sem sessão, o app deve mandar ao login — não mostrar
// uma tela vazia de "Nenhum pipe ainda". Este bloco roda SEM o cookie semeado.
test.describe("BUG-001 — guarda de autenticação", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("deslogado em / é redirecionado para /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: /Entrar com Google/ })).toBeVisible();
    // E não vaza a home protegida:
    await expect(page.getByText("Nenhum pipe ainda")).toHaveCount(0);
  });

  test("deslogado numa rota de pipe também vai para /login", async ({ page }) => {
    await page.goto("/pipes/qualquer-id");
    await expect(page).toHaveURL(/\/login$/);
  });
});
