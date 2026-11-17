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

test.describe('painel: convidar e editar usuários', () => {
  let stamp: string;
  let rootEmail: string;

  test.beforeEach(async ({ page }) => {
    stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    rootEmail = `root.inv.${stamp}@example.com`;
    await register(page, rootEmail);
    promoteToRoot(rootEmail);
  });

  test('administrador convida usuário, gerencia convites e renomeia usuário', async ({ page }) => {
    // 1. Navega para a página de convites
    await page.goto('/admin/invitations');
    await expect(page.getByRole('heading', { name: 'Convites' })).toBeVisible();
    expect(await violations(page), 'página de convites').toEqual([]);

    // 2. Abre o modal de convite
    await page.getByTestId('invite-open-btn').click();
    await expect(page.getByTestId('invite-modal')).toBeVisible();
    expect(await violations(page), 'modal de convite').toEqual([]);

    // 3. Preenche e envia o convite
    const invitedEmail = `convidado.${stamp}@example.com`;
    await page.getByTestId('invite-email-input').fill(invitedEmail);
    await page.getByTestId('invite-submit-btn').click();

    // Modal fecha e convite aparece na lista como Pendente
    await expect(page.getByTestId('invite-modal')).toHaveCount(0);
    const row = page.getByTestId('invitation-row').filter({ hasText: invitedEmail });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('inv-status')).toContainText('Pendente');

    // 4. Reenvia o convite
    await row.getByTestId('resend-btn').click();
    await expect(page.getByText('Convite reenviado com sucesso.')).toBeVisible();

    // 5. Cancela o convite
    await row.getByTestId('cancel-btn').click();
    await expect(page.getByText('Convite cancelado com sucesso.')).toBeVisible();
    await expect(row.getByTestId('inv-status')).toContainText('Cancelado');

    // 6. Teste de renomeação no detalhe de usuário
    await page.goto('/admin/users');
    await expect(page.getByTestId('results-heading')).toBeVisible();
    const rootRow = page.getByTestId('user-row').filter({ hasText: rootEmail });
    await rootRow.getByRole('link').click();

    await expect(page.getByTestId('detail-heading')).toBeVisible();
    await page.getByTestId('action-rename').click();
    await expect(page.getByTestId('rename-modal')).toBeVisible();
    expect(await violations(page), 'modal de renomear').toEqual([]);

    await page.getByTestId('rename-input').fill('Administrador Principal');
    await page.getByTestId('rename-save').click();

    await expect(page.getByTestId('rename-modal')).toHaveCount(0);
    await expect(page.getByTestId('name')).toContainText('Administrador Principal');
  });
});
