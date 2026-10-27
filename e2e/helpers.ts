import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Liga as guardas que o replica-test exige em cada spec:
 *  - falha se o console do navegador logar um erro
 *  - falha se qualquer resposta vier 5xx
 * Chame no começo do teste; devolve um `assertClean()` para o fim.
 */
export function guard(page: Page) {
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
  });

  return {
    assertClean() {
      expect(consoleErrors, `erros de console:\n${consoleErrors.join("\n")}`).toEqual([]);
      expect(serverErrors, `respostas 5xx:\n${serverErrors.join("\n")}`).toEqual([]);
    },
  };
}

/** Scan de acessibilidade axe; falha em violações sérias/críticas. */
export async function a11y(page: Page, context?: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical"
  );
  expect(
    serious,
    `violações a11y${context ? ` em ${context}` : ""}:\n` +
      serious.map((v) => `- ${v.id}: ${v.help}`).join("\n")
  ).toEqual([]);
}
