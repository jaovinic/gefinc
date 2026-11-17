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

async function userSession(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await login(page, email, PASSWORD);
  await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
  return { context, page };
}

const dialog = (page: Page) => page.getByRole('alertdialog');
const confirm = (page: Page) => page.getByTestId('confirm-confirm');

test.describe('painel: redefinição de senha administrativa', () => {
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

  test('reenviar e-mail mantém a sessão do usuário; forçar exige senha, derruba a sessão e invalida a senha atual sem expor link ou token', async ({
    page,
    browser,
    request,
  }) => {
    const user = await userSession(browser, userEmail);
    await page.reload();
    await expect(page.getByTestId('open-sessions')).toHaveText('1');

    // 1. Reenviar e-mail de redefinição
    await page.getByRole('button', { name: 'Reenviar e-mail de redefinição' }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(page.getByTestId('action-effect')).toContainText('novo link de redefinição de senha');
    expect(await violations(page), 'diálogo de reenvio de redefinição').toEqual([]);
    await confirm(page).click();

    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('action-status')).toHaveText('E-mail de redefinição enviado.');
    await expect(page.getByTestId('open-sessions')).toHaveText('1');

    // A sessão do usuário segue válida após o reenvio simples
    await user.page.goto('/accounts');
    await expect(user.page).not.toHaveURL(/\/login/);

    // 2. Forçar redefinição de senha
    await page.getByRole('button', { name: 'Forçar redefinição de senha' }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(page.getByTestId('action-effect')).toContainText('deixam de valer imediatamente');
    await confirm(page).click();
    await expect(page.getByTestId('password-error')).toBeVisible();
    await page.getByLabel('Sua senha, para confirmar').fill(PASSWORD);
    expect(await violations(page), 'diálogo de redefinição forçada').toEqual([]);
    await confirm(page).click();

    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('action-status')).toHaveText('Redefinição de senha forçada e e-mail enviado.');
    await expect(page.getByTestId('open-sessions')).toHaveText('0');

    // Nenhum link ou token de redefinição aparece na página do administrador
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('/reset-password');
    expect(bodyText).not.toContain('token=');

    // Usuário afetado perde a sessão na próxima ação e a senha antiga não entra mais
    await user.page.goto('/accounts');
    await expect(user.page).toHaveURL(/\/login/);
    const loginAttempt = await request.post(`${API}/auth/login`, {
      data: { email: userEmail, password: PASSWORD },
      headers: { 'X-Client': 'web' },
    });
    expect(loginAttempt.status()).toBe(401);

    await user.context.close();
  });
});
