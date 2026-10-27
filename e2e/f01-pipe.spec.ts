import { test, expect } from "@playwright/test";
import { guard, a11y } from "./helpers";

// F01 — construir um pipe (fatia construída: criar com nome).
test.describe("F01 — criar pipe", () => {
  test("F01-H1 cria um pipe e vai para o kanban", async ({ page }) => {
    const g = guard(page);
    await page.goto("/");
    await a11y(page, "OrgHome");

    const nome = `Onboarding ${Date.now()}`;
    await page.getByRole("button", { name: "Novo pipe" }).click();
    await page.getByLabel("Nome do pipe").fill(nome);
    await page.getByRole("button", { name: "Criar" }).click();

    await expect(page).toHaveURL(/\/pipes\/[0-9a-f-]+/i);
    await expect(page.getByRole("heading", { name: nome })).toBeVisible();
    g.assertClean();
  });

  test("F01-E1 botão Criar desabilitado com nome vazio", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Novo pipe" }).click();
    await expect(page.getByRole("button", { name: "Criar" })).toBeDisabled();
    // F01-E2: só espaços também mantém desabilitado
    await page.getByLabel("Nome do pipe").fill("   ");
    await expect(page.getByRole("button", { name: "Criar" })).toBeDisabled();
  });

  test("F01-E4 preserva acentos e emoji", async ({ page }) => {
    const nome = `Pedidos 🚀 çãé ${Date.now()}`;
    await page.goto("/");
    await page.getByRole("button", { name: "Novo pipe" }).click();
    await page.getByLabel("Nome do pipe").fill(nome);
    await page.getByRole("button", { name: "Criar" }).click();
    await expect(page.getByRole("heading", { name: nome })).toBeVisible();
  });

  test("F01-E6 pipe criado persiste após refresh", async ({ page }) => {
    const nome = `Refresh ${Date.now()}`;
    await page.goto("/");
    await page.getByRole("button", { name: "Novo pipe" }).click();
    await page.getByLabel("Nome do pipe").fill(nome);
    await page.getByRole("button", { name: "Criar" }).click();
    await expect(page).toHaveURL(/\/pipes\//);

    await page.goto("/");
    await expect(page.getByRole("button", { name: new RegExp(nome) })).toBeVisible();
  });
});
