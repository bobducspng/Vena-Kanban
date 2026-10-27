import { test, expect } from "@playwright/test";

const PIPE = "Solicitações de compra";
// Card do seed com responsável Ana Souza (ver server/src/seed.ts).
const CARD = "Notebooks para o time de vendas";

// BUG-004: o avatar do responsável (usuário real) deve aparecer no card do
// kanban — antes era resolvido contra o seed do front e sumia.
test("avatar do responsável real aparece no card", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(PIPE) }).click();

  const tile = page
    .getByRole("region", { name: "Novo pedido" })
    .getByRole("button", { name: new RegExp(CARD) });
  await expect(tile.getByRole("img", { name: "Ana Souza" })).toBeVisible();
});
