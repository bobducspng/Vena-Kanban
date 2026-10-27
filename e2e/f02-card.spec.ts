import { test, expect, type Page } from "@playwright/test";
import { guard, a11y } from "./helpers";

// Pipe do seed, com fases Novo pedido → Em análise → Aprovação → Concluído
// e obrigatórios "Item solicitado" + "Valor estimado" na fase inicial.
const PIPE = "Solicitações de compra";

async function abrirPipe(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(PIPE) }).click();
  await expect(page).toHaveURL(/\/pipes\//);
}

test.describe("F02 — card do início ao fim", () => {
  test("F02-H1/H2 cria o card e avança até Concluído", async ({ page }) => {
    const g = guard(page);
    await abrirPipe(page);
    await a11y(page, "PipeKanban");

    const titulo = `Cadeiras ergonômicas 🚀 ${Date.now()}`;
    await page.getByRole("button", { name: "Novo card" }).click();
    await page.getByLabel("Título do card").fill(titulo);
    await page.getByLabel(/Item solicitado/).fill("10 cadeiras");
    await page.getByLabel(/Valor estimado/).fill("5000");
    await page.getByRole("button", { name: "Criar card" }).click();

    // Aparece na fase inicial.
    const inicial = page.getByRole("region", { name: "Novo pedido" });
    await expect(inicial.getByRole("button", { name: new RegExp(titulo) })).toBeVisible();

    // Abre e avança fase a fase.
    await inicial.getByRole("button", { name: new RegExp(titulo) }).click();
    await page.getByRole("button", { name: /Em análise/ }).click();
    await page.getByRole("button", { name: /Aprovação/ }).click();
    await page.getByRole("button", { name: /Concluído/ }).click();

    await expect(page.getByText("Concluído", { exact: true })).toBeVisible();
    await expect(page.getByText("Card criado")).toBeVisible(); // histórico
    g.assertClean();
  });

  test("F02-N1 obrigatório vazio bloqueia a criação", async ({ page }) => {
    await abrirPipe(page);
    await page.getByRole("button", { name: "Novo card" }).click();
    await page.getByLabel("Título do card").fill("Sem item");
    // Deixa "Item solicitado" vazio de propósito.
    await page.getByLabel(/Valor estimado/).fill("100");
    await page.getByRole("button", { name: "Criar card" }).click();

    await expect(page.getByText("Campo obrigatório")).toBeVisible();
    await expect(page.getByText(/Preencha os campos obrigatórios/)).toBeVisible();
    // Modal segue aberto (card não criado).
    await expect(page.getByRole("button", { name: "Criar card" })).toBeVisible();
  });

  test("F02-N2 obrigatório vazio bloqueia o avanço de fase", async ({ page }) => {
    await abrirPipe(page);
    // Cria com o mínimo, depois esvazia um obrigatório e tenta avançar.
    const titulo = `Bloqueio ${Date.now()}`;
    await page.getByRole("button", { name: "Novo card" }).click();
    await page.getByLabel("Título do card").fill(titulo);
    await page.getByLabel(/Item solicitado/).fill("x");
    await page.getByLabel(/Valor estimado/).fill("1");
    await page.getByRole("button", { name: "Criar card" }).click();

    const inicial = page.getByRole("region", { name: "Novo pedido" });
    await inicial.getByRole("button", { name: new RegExp(titulo) }).click();
    await page.getByLabel(/Item solicitado/).fill(""); // esvazia
    await page.getByLabel(/Item solicitado/).blur();
    await page.getByRole("button", { name: /Em análise/ }).click();

    await expect(page.getByText(/Preencha os campos obrigatórios/)).toBeVisible();
  });
});
