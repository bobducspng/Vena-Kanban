import { test, expect, type Page } from "@playwright/test";

const PIPE = "Solicitações de compra";

async function criarCard(page: Page, titulo: string) {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(PIPE) }).click();
  await page.getByRole("button", { name: "Novo card" }).click();
  await page.getByLabel("Título do card").fill(titulo);
  await page.getByLabel(/Item solicitado/).fill("x");
  await page.getByLabel(/Valor estimado/).fill("1");
  await page.getByRole("button", { name: "Criar card" }).click();
  await expect(page.getByRole("region", { name: "Novo pedido" }).getByRole("button", { name: new RegExp(titulo) })).toBeVisible();
}

// BUG-003: o detalhe mostra os campos da fase atual, não só os da inicial.
test.describe("BUG-003 — campos de fase não-inicial no detalhe", () => {
  test('campo da fase "Em análise" aparece e é editável', async ({ page }) => {
    const titulo = `Parecer ${Date.now()}`;
    await criarCard(page, titulo);

    const inicial = page.getByRole("region", { name: "Novo pedido" });
    await inicial.getByRole("button", { name: new RegExp(titulo) }).click();
    await page.getByRole("button", { name: /Em análise/ }).click();

    // Antes do fix este campo nunca era renderizado.
    const parecer = page.getByLabel(/Parecer da análise/);
    await expect(parecer).toBeVisible();
    await parecer.fill("Aprovado pelo gestor");

    // Persiste: fecha e reabre o card.
    await page.keyboard.press("Escape");
    await page.getByRole("region", { name: "Em análise" }).getByRole("button", { name: new RegExp(titulo) }).click();
    await expect(page.getByLabel(/Parecer da análise/)).toHaveValue("Aprovado pelo gestor");
  });
});

// BUG-005: mover o mesmo card em duas abas detecta o conflito de versão.
test.describe("BUG-005 — trava otimista de versão", () => {
  test("segundo move sobre estado velho é rejeitado", async ({ page, context }) => {
    const titulo = `Conflito ${Date.now()}`;
    await criarCard(page, titulo);

    // Aba A e aba B abrem o MESMO card na versão 0.
    const abrir = async (p: Page) => {
      await p.goto("/");
      await p.getByRole("button", { name: new RegExp(PIPE) }).click();
      await p.getByRole("region", { name: "Novo pedido" }).getByRole("button", { name: new RegExp(titulo) }).click();
    };
    await abrir(page);
    const pageB = await context.newPage();
    await abrir(pageB);

    // Aba A avança (versão 0 → 1).
    await page.getByRole("button", { name: /Em análise/ }).click();
    await expect(page.getByText("Card movido")).toBeVisible();

    // Aba B, ainda na versão 0, tenta avançar → conflito.
    await pageB.getByRole("button", { name: /Em análise/ }).click();
    await expect(pageB.getByText(/alterado por outra pessoa/)).toBeVisible();
    await pageB.close();
  });
});
