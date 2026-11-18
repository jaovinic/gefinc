import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { promoteToRoot, register } from './support';

/** Falhas de acessibilidade graves (WCAG 2 A e AA) da página aberta. */
async function violations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return result.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('painel: parâmetros do sistema e modo de manutenção', () => {
  let rootEmail: string;

  test.beforeEach(async ({ page }) => {
    rootEmail = `raiz.${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
    await register(page, rootEmail);
    promoteToRoot(rootEmail);
  });

  test('mostra parâmetros de implantação e permite alternar novos cadastros e modo de manutenção', async ({ page }) => {
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: 'Parâmetros do sistema', exact: true })).toBeVisible();

    // 1. Parâmetros somente leitura
    await expect(page.getByTestId('readonly-parameters')).toBeVisible();

    // 2. Novos cadastros
    const signupsToggle = page.getByTestId('signups-toggle-btn');
    await expect(signupsToggle).toBeVisible();

    // 3. Modo de manutenção
    const maintToggle = page.getByTestId('maint-toggle-btn');
    await expect(maintToggle).toBeVisible();

    // 4. Modal de revogação de sessões
    await page.getByTestId('revoke-all-open-btn').click();
    await expect(page.getByRole('alertdialog', { name: 'Encerrar todas as sessões do sistema' })).toBeVisible();
    await page.getByTestId('confirm-cancel').click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    expect(await violations(page)).toEqual([]);
  });

  test('o item Parâmetros aparece no menu de navegação administrativa', async ({ page }) => {
    await page.goto('/admin/users');
    await page.getByRole('link', { name: 'Parâmetros', exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/settings$/);
  });
});
