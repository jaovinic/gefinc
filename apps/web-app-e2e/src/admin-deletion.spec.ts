import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { PASSWORD, promoteToRoot, register } from './support';

/** Falhas de acessibilidade graves (WCAG 2 A e AA) da página aberta. */
async function violations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return result.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('painel: exclusão de usuários e comunicados pendentes', () => {
  let stamp: string;
  let rootEmail: string;
  let targetEmail: string;

  test.beforeEach(async ({ page }) => {
    stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    rootEmail = `root.del.${stamp}@example.com`;
    targetEmail = `target.del.${stamp}@example.com`;

    // Registra o usuário alvo
    await register(page, targetEmail);

    // Registra e promove o admin raiz
    await register(page, rootEmail);
    promoteToRoot(rootEmail);
  });

  test('administrador agenda exclusão de usuário e depois cancela a solicitação', async ({ page }) => {
    // 1. Navega para a lista de usuários e clica no usuário alvo
    await page.goto('/admin/users');
    await expect(page.getByTestId('results-heading')).toBeVisible();

    const targetRow = page.getByTestId('user-row').filter({ hasText: targetEmail });
    await targetRow.getByRole('link').click();

    await expect(page.getByTestId('detail-heading')).toBeVisible();
    expect(await violations(page), 'detalhe do usuário').toEqual([]);

    // 2. Clica em Excluir conta para abrir o diálogo
    await page.getByTestId('action-delete').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByTestId('privacy-notice')).toBeVisible();
    expect(await violations(page), 'diálogo de exclusão').toEqual([]);

    // 3. Preenche o formulário de exclusão
    await page.getByTestId('deletion-reason-select').selectOption({ index: 1 });
    await page
      .getByTestId('deletion-justification')
      .fill('Solicitação formal de exclusão com base na LGPD enviada pelo titular.');
    await page.getByTestId('deletion-days-input').fill('15');
    await page.getByTestId('deletion-confirm-email').fill(targetEmail);
    await page.getByTestId('deletion-password').fill(PASSWORD);

    // 4. Confirma a exclusão
    await page.getByTestId('confirm-confirm').click();

    // 5. Verifica que o diálogo fechou e a conta agora mostra exclusão agendada
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByTestId('deletion')).toContainText('Exclusão agendada');
    await expect(page.getByTestId('action-cancel-deletion')).toBeVisible();

    // 6. Cancela a exclusão agendada
    await page.getByTestId('action-cancel-deletion').click();
    await expect(page.getByText('Exclusão agendada cancelada.')).toBeVisible();
    await expect(page.getByTestId('deletion')).toContainText('Sem exclusão pendente');

    // 7. Acessa a tela de comunicações pendentes e verifica acessibilidade
    await page.goto('/admin/communications/pending');
    await expect(page.getByTestId('pending-communications-page')).toBeVisible();
    expect(await violations(page), 'tela de comunicações pendentes').toEqual([]);
  });
});
