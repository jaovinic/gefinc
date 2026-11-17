import AxeBuilder from '@axe-core/playwright';
import { APIRequestContext, Page, expect, test } from '@playwright/test';
import { API, PASSWORD, apiLogin, chooseOption, promoteToRoot, register } from './support';

/** Falhas de acessibilidade graves (WCAG 2 A e AA) da página aberta. */
async function violations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return result.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

async function createUser(request: APIRequestContext, email: string) {
  const response = await request.post(`${API}/auth/register`, { data: { email, password: PASSWORD }, headers: { 'X-Client': 'web' } });
  expect(response.status()).toBe(201);
  return (await response.json()).id as number;
}

const rows = (page: Page) => page.getByTestId('audit-row');

test.describe('painel: consulta do registro de auditoria', () => {
  let stamp: string;
  let rootEmail: string;
  let targetEmail: string;
  let targetId: number;

  test.beforeEach(async ({ page, request }) => {
    stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    rootEmail = `raiz.${stamp}@example.com`;
    targetEmail = `alvo.${stamp}@example.com`;
    await register(page, rootEmail);
    promoteToRoot(rootEmail);
    targetId = await createUser(request, targetEmail);

    const token = await apiLogin(request, rootEmail);
    const suspended = await request.post(`${API}/admin/users/${targetId}/suspend`, {
      data: { reason: `Motivo E2E ${stamp}` },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(suspended.status()).toBe(204);

    const reactivated = await request.post(`${API}/admin/users/${targetId}/reactivate`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(reactivated.status()).toBe(204);

    await page.goto('/admin/audit');
    await expect(page.getByRole('heading', { name: 'Auditoria', exact: true })).toBeVisible();
    await expect(rows(page).first()).toBeVisible();
  });

  test('lista as ações da mais recente à mais antiga, filtra por ação/alvo e expande o detalhe com motivo', async ({ page }) => {
    await page.getByTestId('filter-target').fill(String(targetId));
    await page.getByTestId('filter-target').dispatchEvent('change');
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).first().getByTestId('summary')).toContainText('Usuário reativado');
    await expect(rows(page).nth(1).getByTestId('summary')).toContainText('Usuário suspenso');

    await chooseOption(page, page, 'Ação', 'Usuário suspenso');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first().getByTestId('target')).toContainText(targetEmail);

    await rows(page).first().getByTestId('toggle-detail').click();
    const detail = page.getByTestId('audit-detail');
    await expect(detail).toBeVisible();
    await expect(detail.getByTestId('detail-reason')).toHaveText(`Motivo E2E ${stamp}`);

    // Nenhum controle de edição, exclusão ou exportação existe na tela
    await expect(page.getByRole('button', { name: /exportar|excluir|apagar|editar/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /exportar/i })).toHaveCount(0);
    expect(await violations(page), 'auditoria com detalhe aberto').toEqual([]);
  });
});
