import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { PASSWORD, login, promoteToRoot, register, selectTrigger } from './support';

/** Falhas de acessibilidade graves (WCAG 2 A e AA) da página aberta. */
async function violations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return result.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('aviso de exclusão e cancelamento no login web (US12)', () => {
  let stamp: string;
  let rootEmail: string;
  let targetEmail: string;

  test.beforeEach(async ({ page }) => {
    stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    rootEmail = `root.delnot.${stamp}@example.com`;
    targetEmail = `target.delnot.${stamp}@example.com`;

    // 1. Registra o usuário alvo
    await register(page, targetEmail);

    // 2. Registra e promove o admin raiz
    await register(page, rootEmail);
    promoteToRoot(rootEmail);
  });

  test('exclusão administrativa com prazo mostra aviso ao entrar, sem cancelar, e acessível via axe', async ({
    page,
  }) => {
    // 1. Admin agenda exclusão com prazo para o usuário alvo
    await page.goto('/admin/users');
    await expect(page.getByTestId('results-heading')).toBeVisible();

    const targetRow = page.getByTestId('user-row').filter({ hasText: targetEmail });
    await targetRow.getByRole('link').click();
    await expect(page.getByTestId('detail-heading')).toBeVisible();

    await page.getByTestId('action-delete').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();

    await selectTrigger(page, page, 'Motivo da exclusão').click();
    await page.getByRole('option').first().click();
    await page.getByTestId('deletion-justification').fill('Violação das regras de convivência.');
    await page.getByTestId('deletion-days-input').fill('15');
    await page.getByTestId('deletion-confirm-email').fill(targetEmail);
    await page.getByTestId('deletion-password').fill(PASSWORD);
    await page.getByTestId('confirm-confirm').click();

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByTestId('deletion')).toContainText('Exclusão agendada');

    // 2. Desconecta o admin e tenta logar como o usuário alvo
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await login(page, targetEmail, PASSWORD);

    // 3. O aviso de exclusão aparece com o prazo, motivo genérico e orientação de suporte
    const alert = page.getByTestId('deletion-warning');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(alert).toContainText('A exclusão desta conta está agendada para');
    await expect(alert).toContainText('suporte');

    // NÃO há opção de cancelar a exclusão pelo usuário
    await expect(page.getByRole('button', { name: 'Cancelar a exclusão e entrar' })).toHaveCount(0);

    // 4. Verificação de acessibilidade
    expect(await violations(page), 'aviso de exclusão administrativa no login').toEqual([]);
  });

  test('cancelamento pelo administrador mostra o aviso único de cancelamento e permite dispensar', async ({
    page,
  }) => {
    // 1. Admin agenda exclusão com prazo
    await page.goto('/admin/users');
    await expect(page.getByTestId('results-heading')).toBeVisible();

    const targetRow = page.getByTestId('user-row').filter({ hasText: targetEmail });
    await targetRow.getByRole('link').click();
    await expect(page.getByTestId('detail-heading')).toBeVisible();

    await page.getByTestId('action-delete').click();
    await selectTrigger(page, page, 'Motivo da exclusão').click();
    await page.getByRole('option').first().click();
    await page.getByTestId('deletion-justification').fill('Cancelamento programado para teste.');
    await page.getByTestId('deletion-days-input').fill('15');
    await page.getByTestId('deletion-confirm-email').fill(targetEmail);
    await page.getByTestId('deletion-password').fill(PASSWORD);
    await page.getByTestId('confirm-confirm').click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    // 2. Admin cancela a exclusão agendada
    await page.getByTestId('action-cancel-deletion').click();
    await expect(page.getByTestId('toast-region').getByText('Exclusão agendada cancelada.')).toBeVisible();

    // 3. Usuário alvo faz login
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await login(page, targetEmail, PASSWORD);
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();

    // 4. O aviso de cancelamento aparece na casca da aplicação (Shell)
    const shellNotice = page.locator('div[role="alert"]').filter({ hasText: 'cancelada' });
    await expect(shellNotice).toBeVisible();
    await expect(shellNotice).toContainText('Sua conta segue ativa');

    expect(await violations(page), 'aviso de cancelamento na casca').toEqual([]);

    // 5. Clica em Fechar para dispensar
    await shellNotice.getByRole('button', { name: 'Fechar' }).click();
    await expect(shellNotice).toHaveCount(0);
  });
});
