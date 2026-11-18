import AxeBuilder from '@axe-core/playwright';
import { APIRequestContext, Browser, BrowserContext, Page, expect, test } from '@playwright/test';
import { API, PASSWORD, login, promoteToRoot, register } from './support';

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

/** Um navegador separado (cookies próprios) em que o usuário afetado entra pela tela de login. */
async function userSession(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await login(page, email, PASSWORD);
  await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
  return { context, page };
}

/** A próxima ação do usuário afetado: a tela volta a pedir a API e, sem sessão, cai no login. */
async function nextAction(page: Page) {
  await page.goto('/accounts');
}

const dialog = (page: Page) => page.getByRole('alertdialog');
const confirm = (page: Page) => page.getByTestId('confirm-confirm');

test.describe('painel: suspensão, sessões e bloqueio de login', () => {
  let stamp: string;
  let rootEmail: string;
  let userEmail: string;
  let userId: number;

  test.beforeEach(async ({ page, request }) => {
    stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    rootEmail = `raiz.${stamp}@example.com`;
    userEmail = `alvo.${stamp}@example.com`;
    await register(page, rootEmail);
    promoteToRoot(rootEmail);
    userId = await createUser(request, userEmail);
    await page.goto(`/admin/users/${userId}`);
    await expect(page.getByTestId('detail-heading')).toBeVisible();
  });

  test('suspender derruba o usuário na próxima ação, o login mostra "procure o suporte" e reativar restaura', async ({ page, browser }) => {
    const user = await userSession(browser, userEmail);
    await page.reload();
    await expect(page.getByTestId('open-sessions')).toHaveText('1');

    await page.getByRole('button', { name: 'Suspender conta' }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(page.getByTestId('action-effect')).toContainText('perde o acesso');
    await confirm(page).click();
    await expect(page.getByTestId('reason-error')).toBeVisible();
    await page.getByLabel('Motivo', { exact: true }).fill('Uso indevido da plataforma');
    await expect(page.getByTestId('reason-counter')).toHaveText('26/500');
    expect(await violations(page), 'diálogo de suspensão').toEqual([]);
    await confirm(page).click();

    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('action-status')).toHaveText('Conta suspensa.');
    await expect(page.getByTestId('status')).toHaveText('Suspenso');
    await expect(page.getByTestId('open-sessions')).toHaveText('0');
    await expect(page.getByRole('button', { name: 'Reativar conta' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suspender conta' })).toHaveCount(0);
    expect(await violations(page), 'detalhe do usuário suspenso').toEqual([]);

    // O usuário afetado cai na próxima ação e, com a senha certa, só vê a orientação do suporte.
    await nextAction(user.page);
    await expect(user.page).toHaveURL(/\/login/);
    await login(user.page, userEmail, PASSWORD);
    const alert = user.page.getByRole('alert');
    await expect(alert).toContainText('Conta suspensa. Procure o suporte.');
    await expect(alert).not.toContainText('Uso indevido');

    await page.getByRole('button', { name: 'Reativar conta' }).click();
    await expect(page.getByTestId('action-effect')).toContainText('precisará entrar de novo');
    await confirm(page).click();
    await expect(page.getByTestId('action-status')).toHaveText('Conta reativada.');
    await expect(page.getByTestId('status')).toHaveText('Ativo');

    await login(user.page, userEmail, PASSWORD);
    await expect(user.page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
    await user.context.close();
  });

  test('encerrar uma sessão derruba só ela; encerrar todas derruba as demais', async ({ page, browser }) => {
    const first = await userSession(browser, userEmail);
    const second = await userSession(browser, userEmail);
    await page.reload();
    const sessionRows = page.getByTestId('session-row');
    await expect(sessionRows).toHaveCount(2);
    await expect(page.getByTestId('open-sessions')).toHaveText('2');

    // a mais recente (segundo navegador) vem primeiro; a mais antiga é a do primeiro navegador
    await sessionRows.last().getByRole('button', { name: 'Encerrar' }).click();
    await expect(page.getByTestId('action-effect')).toContainText('na próxima ação');
    await confirm(page).click();
    await expect(page.getByTestId('open-sessions')).toHaveText('1');
    await expect(sessionRows).toHaveCount(1);

    await nextAction(first.page);
    await expect(first.page).toHaveURL(/\/login/);
    await second.page.goto('/accounts');
    await expect(second.page).not.toHaveURL(/\/login/);

    await page.getByRole('button', { name: 'Encerrar todas' }).click();
    await expect(page.getByTestId('action-effect')).toContainText('Encerra a única sessão aberta agora');
    await confirm(page).click();
    await expect(page.getByTestId('sessions-empty')).toHaveText('Nenhuma sessão aberta.');
    await expect(page.getByTestId('open-sessions')).toHaveText('0');
    // Encerrar sessões não suspende: o usuário afetado só precisa entrar de novo.
    await expect(page.getByTestId('status')).toHaveText('Ativo');

    await nextAction(second.page);
    await expect(second.page).toHaveURL(/\/login/);
    await login(second.page, userEmail, PASSWORD);
    await expect(second.page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
    expect(await violations(page), 'lista de sessões').toEqual([]);
    await first.context.close();
    await second.context.close();
  });

  test('retirar o bloqueio por tentativas libera o login na hora', async ({ page, request }) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request.post(`${API}/auth/login`, { data: { email: userEmail, password: 'senha-errada-999' }, headers: { 'X-Client': 'web' } });
      expect(response.status()).toBe(401);
    }
    const blocked = await request.post(`${API}/auth/login`, { data: { email: userEmail, password: PASSWORD }, headers: { 'X-Client': 'web' } });
    expect(blocked.status()).toBe(429);

    await page.reload();
    await expect(page.getByTestId('login-lock')).toContainText('Bloqueado até');
    await page.getByRole('button', { name: 'Retirar bloqueio de login' }).click();
    await expect(page.getByTestId('action-effect')).toContainText('liberado agora');
    await confirm(page).click();

    await expect(page.getByTestId('action-status')).toHaveText('Bloqueio de login retirado.');
    await expect(page.getByTestId('login-lock')).toHaveText('Sem bloqueio');
    const released = await request.post(`${API}/auth/login`, { data: { email: userEmail, password: PASSWORD }, headers: { 'X-Client': 'web' } });
    expect(released.status()).toBe(200);
  });

  test('o administrador raiz não tem ações e a lista de sessões dele é só de leitura', async ({ page }) => {
    await page.goto('/admin/users');
    await page.getByLabel('Buscar por e-mail ou nome').fill(`raiz.${stamp}`);
    await page.getByRole('link', { name: rootEmail }).click();

    await expect(page.getByTestId('protected')).toHaveText('Administrador raiz protegido');
    await expect(page.getByTestId('actions').getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('session-row').getByRole('button')).toHaveCount(0);
  });
});
