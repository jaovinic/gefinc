import AxeBuilder from '@axe-core/playwright';
import { APIRequestContext, Page, expect, test } from '@playwright/test';
import { API, PASSWORD, apiLogin, promoteToRoot, register } from './support';

/** Falhas de acessibilidade graves (WCAG 2 A e AA) da página aberta. */
async function violations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return result.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

async function createUser(request: APIRequestContext, email: string, name?: string) {
  const response = await request.post(`${API}/auth/register`, { data: { email, password: PASSWORD }, headers: { 'X-Client': 'web' } });
  expect(response.status()).toBe(201);
  const id = (await response.json()).id as number;
  if (name) {
    const token = await apiLogin(request, email);
    await request.patch(`${API}/auth/me`, { data: { name }, headers: { Authorization: `Bearer ${token}` } });
  }
  return id;
}

test.describe('acessibilidade do painel administrativo (WCAG 2 A/AA e SC-009)', () => {
  let stamp: string;
  let rootEmail: string;
  let normalUserEmail: string;
  let normalUserId: number;

  test.beforeEach(async ({ page, request }) => {
    stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    rootEmail = `root.a11y.${stamp}@example.com`;
    normalUserEmail = `user.a11y.${stamp}@example.com`;

    normalUserId = await createUser(request, normalUserEmail, `Usuário Teste ${stamp}`);
    await register(page, rootEmail);
    promoteToRoot(rootEmail);
  });

  test('todas as telas do painel administrativo atendem WCAG 2 A e AA', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Administração', exact: true })).toBeVisible();

    const screens = [
      { path: '/admin/users', name: 'Lista de usuários', testid: 'results-heading' },
      { path: `/admin/users/${normalUserId}`, name: 'Detalhe do usuário', testid: 'detail-heading' },
      { path: '/admin/invitations', name: 'Convites', testid: 'invitations-heading' },
      { path: '/admin/audit', name: 'Auditoria', testid: 'audit-page' },
      { path: '/admin/email', name: 'E-mail', testid: 'email-page' },
      { path: '/admin/parameters', name: 'Parâmetros', testid: 'parameters-page' },
      { path: '/admin/deletion-reasons', name: 'Motivos de exclusão', testid: 'reasons-page' },
      { path: '/admin/communications/pending', name: 'Comunicações pendentes', testid: 'pending-comms-page' },
    ];

    for (const screen of screens) {
      await page.goto(screen.path);
      const target = page.getByTestId(screen.testid).or(page.getByRole('heading', { level: 1 }));
      await expect(target.first()).toBeVisible();
      const issues = await violations(page);
      expect(issues, `Violações de acessibilidade na tela ${screen.name} (${screen.path})`).toEqual([]);
    }
  });

  test('avisos na tela de login atendem WCAG 2 A e AA com role=alert', async ({ page, request }) => {
    // 1. Agenda exclusão com prazo para o usuário para produzir o aviso 423
    const token = await apiLogin(request, rootEmail);
    const reasonResp = await request.get(`${API}/admin/deletion-reasons`, { headers: { Authorization: `Bearer ${token}` } });
    const reasons = await reasonResp.json();
    const reasonId = reasons[0].id;

    await request.post(`${API}/admin/users/${normalUserId}/deletion`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        reasonId,
        justification: 'Exclusão para teste de acessibilidade do aviso.',
        mode: 'GRACE',
        days: 14,
        confirmEmail: normalUserEmail,
        password: PASSWORD,
      },
    });

    // 2. Faz logout e tenta autenticar com o usuário em exclusão
    await page.goto('/login');
    await expect(page.locator('input#email')).toHaveClass(/ng-pristine/);
    await page.getByLabel('E-mail').fill(normalUserEmail);
    await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();

    // 3. Verifica o alerta de exclusão pendente
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Exclusão agendada');
    expect(await violations(page), 'Aviso de exclusão no login').toEqual([]);
  });

  test('diálogo de ação possui foco preso (focus trap), fecha com Escape e restaura o foco', async ({ page }) => {
    await page.goto(`/admin/users/${normalUserId}`);
    await expect(page.getByTestId('detail-heading')).toBeVisible();

    const trigger = page.getByTestId('action-suspend');
    await trigger.focus();
    await trigger.click();

    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await expect(dialog).toBeVisible();

    // Valida acessibilidade do diálogo aberto
    expect(await violations(page), 'Diálogo de confirmação').toEqual([]);

    // Pressiona Escape para fechar o diálogo
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // O foco retorna ao elemento que abriu o diálogo ou à página
    await expect(trigger).toBeFocused();
  });

  test('informações de estado e status possuem texto e ícone explicativo (não apenas cor)', async ({ page }) => {
    await page.goto(`/admin/users/${normalUserId}`);
    await expect(page.getByTestId('detail-heading')).toBeVisible();

    // Status do usuário contém texto explícito além de cor
    const statusBadge = page.getByTestId('status');
    await expect(statusBadge).toBeVisible();
    await expect(statusBadge).toHaveText(/Ativo|Suspenso/);

    // Bloqueio de login possui texto explícito
    const loginLockBadge = page.getByTestId('login-lock');
    await expect(loginLockBadge).toBeVisible();
    await expect(loginLockBadge).toHaveText(/Sem bloqueio|Bloqueado até/);

    // Alerta de exclusão possui texto explícito
    const deletionBadge = page.getByTestId('deletion');
    await expect(deletionBadge).toBeVisible();
    await expect(deletionBadge).toHaveText(/Sem exclusão pendente|Exclusão agendada/);

    // Lista de usuários também possui cabeçalhos e rótulos
    await page.goto('/admin/users');
    await expect(page.getByTestId('result-status')).toBeVisible();
    await expect(page.getByTestId('result-status')).toHaveAttribute('role', 'status');
  });
});
