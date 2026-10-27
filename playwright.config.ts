import { defineConfig, devices } from "@playwright/test";

/**
 * E2E para o front "app" ligado ao backend "server" + MySQL.
 *
 * Login é só Google OAuth real, que não dá para automatizar: o `global-setup`
 * injeta uma sessão direto no banco (usuário do seed) e grava o cookie `sid`
 * em `e2e/.auth/state.json`, usado como `storageState` por todos os specs.
 *
 * Pré-requisitos para rodar (na VM ou em qualquer host com MySQL):
 *   1. server/.env preenchido; `npm run -w server db:migrate && db:seed`
 *   2. backend no ar em http://localhost:4000 (npm run dev:server)
 *   3. app/.env.local com VITE_API_URL=http://localhost:4000
 *   4. npm i -D @playwright/test @axe-core/playwright dotenv && npx playwright install chromium
 *   5. npx playwright test
 *
 * O `webServer` abaixo sobe o app; o backend + MySQL você sobe à parte
 * (precisam de .env/credenciais). Ajuste se quiser que o Playwright os suba.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:5173",
    storageState: "e2e/.auth/state.json",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev:app",
    url: process.env.APP_URL ?? "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
