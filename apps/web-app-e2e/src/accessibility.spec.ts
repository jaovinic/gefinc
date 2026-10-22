import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { createAccount, register, uniqueEmail } from './support';

/** Falhas de acessibilidade graves (WCAG 2 A e AA) da página aberta. */
async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return result.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('acessibilidade (WCAG AA)', () => {
  test('telas de acesso', async ({ page }) => {
    for (const path of ['/login', '/register', '/forgot-password']) {
      await page.goto(path);
      await expect(page.getByRole('button').first()).toBeVisible();
      expect(await violations(page), path).toEqual([]);
    }
  });

  test('telas autenticadas', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú', 'CHECKING');
    await createAccount(page, 'Nubank', 'CREDIT_CARD', { closing: 10, due: 17 });

    for (const [path, heading] of [
      ['/', 'Painel do mês'],
      ['/transactions', 'Lançamentos'],
      ['/invoices', 'Faturas'],
      ['/cashflow', 'Fluxo de caixa'],
      ['/accounts', 'Contas e cartões'],
      ['/categories', 'Categorias'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
      expect(await violations(page), path).toEqual([]);
    }
  });
});
