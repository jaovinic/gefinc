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

test.describe('painel: diagnóstico do serviço de e-mail', () => {
  test('mostra a configuração sem segredos, envia o teste e lista o envio no histórico', async ({ page }) => {
    const email = `raiz.${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
    await register(page, email);
    promoteToRoot(email);

    await page.goto('/admin/email');
    await expect(page.getByRole('heading', { name: 'E-mail', exact: true })).toBeVisible();
    await expect(page.getByTestId('config-host')).not.toBeEmpty();
    await expect(page.getByTestId('config-card')).not.toContainText(/senha/i);

    await page.getByTestId('send-test').click();
    await expect(page.getByTestId('test-result')).toContainText(/Enviado|Falhou/);
    // o histórico é global: outros testes em paralelo também enviam e-mails, então a linha é achada pelo destinatário
    const row = page.getByTestId('delivery-row').filter({ hasText: email }).first();
    await expect(row.getByTestId('kind')).toContainText('Teste');
    await expect(row.getByTestId('recipient')).toContainText(email);
    await expect(row.getByTestId('resend')).toHaveCount(0);

    expect(await violations(page)).toEqual([]);
  });

  test('o item E-mail aparece no menu da administração', async ({ page }) => {
    const email = `raiz.${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
    await register(page, email);
    promoteToRoot(email);

    await page.goto('/admin/users');
    await page.getByRole('link', { name: 'E-mail', exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/email$/);
  });
});
