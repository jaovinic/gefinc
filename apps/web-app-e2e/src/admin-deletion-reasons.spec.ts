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

test.describe('painel: motivos de exclusão', () => {
  let stamp: string;
  let rootEmail: string;

  test.beforeEach(async ({ page }) => {
    stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    rootEmail = `root.reasons.${stamp}@example.com`;

    await register(page, rootEmail);
    promoteToRoot(rootEmail);
  });

  test('administrador gerencia motivos de exclusão (listar, criar, editar, desativar/reativar)', async ({ page }) => {
    // 1. Navega para a página de motivos
    await page.goto('/admin/deletion-reasons');
    await expect(page.getByTestId('reasons-page')).toBeVisible();
    expect(await violations(page), 'página de motivos de exclusão').toEqual([]);

    // 2. Confere os motivos iniciais
    const initialBadges = page.getByTestId('reason-badge-initial');
    await expect(initialBadges.first()).toBeVisible();

    // 3. Abre o modal de criação de motivo
    await page.getByTestId('create-reason-btn').click();
    await expect(page.getByTestId('reason-modal')).toBeVisible();
    expect(await violations(page), 'modal de criação de motivo').toEqual([]);

    // 4. Preenche o novo motivo
    const customReasonName = `Motivo E2E ${stamp}`;
    await page.getByTestId('input-reason-name').fill(customReasonName);
    await page
      .getByTestId('input-reason-message')
      .fill('Sua conta foi programada para exclusão por encerramento de contrato com a organização parceira.');
    await page.getByTestId('modal-save-btn').click();

    // 5. Modal fecha e novo motivo aparece ativo na lista
    await expect(page.getByTestId('reason-modal')).toHaveCount(0);
    const customRow = page.getByTestId('reason-row').filter({ hasText: customReasonName });
    await expect(customRow).toBeVisible();
    await expect(customRow.getByTestId('reason-status')).toContainText('Ativo');

    // 6. Edita o motivo
    await customRow.getByTestId('edit-reason-btn').click();
    await expect(page.getByTestId('reason-modal')).toBeVisible();
    await page
      .getByTestId('input-reason-message')
      .fill('Sua conta foi programada para exclusão devido à rescisão do convênio institucional.');
    await page.getByTestId('modal-save-btn').click();

    await expect(page.getByTestId('reason-modal')).toHaveCount(0);
    await expect(customRow.getByTestId('reason-message')).toContainText('rescisão do convênio institucional');

    // 7. Desativa o motivo
    await customRow.getByTestId('deactivate-reason-btn').click();
    await expect(page.getByText('Motivo de exclusão desativado.')).toBeVisible();
    await expect(customRow.getByTestId('reason-status')).toContainText('Inativo');

    // 8. Reativa o motivo
    await customRow.getByTestId('activate-reason-btn').click();
    await expect(page.getByText('Motivo de exclusão reativado com sucesso.')).toBeVisible();
    await expect(customRow.getByTestId('reason-status')).toContainText('Ativo');
  });
});
