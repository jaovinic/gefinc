import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { API, PASSWORD, apiLogin, login, promoteToRoot, register, uniqueEmail } from './support';

/** Falhas de acessibilidade graves (WCAG 2 A e AA) da página aberta. */
async function violations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return result.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

const adminNav = (page: Page) => page.getByTestId('sidenav').getByRole('navigation', { name: 'Administração' });

test.describe('acesso restrito ao perfil de administrador', () => {
  test('usuário comum não vê o menu Administração e é barrado em /admin', async ({ page }) => {
    await register(page, uniqueEmail());

    await expect(adminNav(page)).toHaveCount(0);

    await page.goto('/admin/users');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Administração', exact: true })).toHaveCount(0);
  });

  test('visitante é levado ao login e continua sem acesso', async ({ page }) => {
    await page.goto('/admin/users');

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Administração', exact: true })).toHaveCount(0);
  });

  test('chamada direta à API sem o perfil é negada (401 visitante, 403 comum)', async ({ page, request }) => {
    const anonymous = await request.get(`${API}/admin/users`);
    expect(anonymous.status()).toBe(401);

    const email = uniqueEmail();
    await register(page, email);
    const token = await apiLogin(request, email);
    const denied = await request.get(`${API}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
    expect(denied.status()).toBe(403);
    expect((await denied.json()).code).toBe('FORBIDDEN');
  });

  test('administrador raiz vê o menu e o painel, acessível (WCAG AA)', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    promoteToRoot(email);

    await page.goto('/');
    await expect(adminNav(page)).toBeVisible();
    await adminNav(page).getByRole('link', { name: 'Usuários' }).click();

    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.getByRole('heading', { name: 'Administração', exact: true })).toBeVisible();
    expect(await violations(page), 'painel aberto').toEqual([]);

    await page.getByTestId('sidenav').getByRole('button', { name: 'Recolher menu' }).click();
    await expect(adminNav(page).getByRole('link', { name: 'Usuários' })).toHaveAttribute('data-label', 'Usuários');
    expect(await violations(page), 'menu recolhido').toEqual([]);
  });

  test('conceder o perfil vale logo; retirar revoga os tokens e a sessão cai no login, e um novo login volta como usuário comum', async ({ page, browser, request }) => {
    const rootEmail = uniqueEmail();
    await register(page, rootEmail);
    promoteToRoot(rootEmail);
    const rootToken = await apiLogin(request, rootEmail);

    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    const otherEmail = uniqueEmail();
    await register(other, otherEmail);
    const otherId = (await (await request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${await apiLogin(request, otherEmail)}` } })).json()).id as number;
    await expect(adminNav(other)).toHaveCount(0);

    const setRole = (role: 'ADMIN' | 'USER') =>
      request.put(`${API}/admin/users/${otherId}/role`, {
        headers: { Authorization: `Bearer ${rootToken}` },
        data: { role, password: PASSWORD },
      });

    expect((await setRole('ADMIN')).status()).toBe(204);
    await other.goto('/');
    await expect(adminNav(other)).toBeVisible();
    await other.goto('/admin/users');
    await expect(other.getByRole('heading', { name: 'Administração', exact: true })).toBeVisible();
    const adminToken = await apiLogin(request, otherEmail);
    const listUsers = (token: string) => request.get(`${API}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
    expect((await listUsers(adminToken)).status()).toBe(200);

    expect((await setRole('USER')).status()).toBe(204);
    // Retirar o perfil revoga todos os tokens do usuário (AdminRoleService): o token de administrador deixa de valer
    // e a sessão do navegador não se renova, então recarregar /admin/users termina no login (e não em "/").
    expect((await listUsers(adminToken)).status()).toBe(401);
    await other.goto('/admin/users');
    await expect(other).toHaveURL(/\/login/);
    await expect(other.getByRole('heading', { name: 'Administração', exact: true })).toHaveCount(0);

    // Com um novo login, a conta já volta como usuário comum: sem menu Administração e barrada em /admin.
    await login(other, otherEmail, PASSWORD);
    await expect(other.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
    await expect(adminNav(other)).toHaveCount(0);
    expect((await listUsers(await apiLogin(request, otherEmail))).status()).toBe(403);
    await other.goto('/admin/users');
    await expect(other).toHaveURL(/\/$/);

    await otherContext.close();
  });

  test('o raiz não pode ser rebaixado pelo painel (ROOT_PROTECTED)', async ({ page, browser, request }) => {
    const rootEmail = uniqueEmail();
    await register(page, rootEmail);
    promoteToRoot(rootEmail);
    const rootId = (await (await request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${await apiLogin(request, rootEmail)}` } })).json()).id as number;

    const adminEmail = uniqueEmail();
    const adminContext = await browser.newContext();
    await register(await adminContext.newPage(), adminEmail);
    const rootToken = await apiLogin(request, rootEmail);
    const adminId = (await (await request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${await apiLogin(request, adminEmail)}` } })).json()).id as number;
    await request.put(`${API}/admin/users/${adminId}/role`, { headers: { Authorization: `Bearer ${rootToken}` }, data: { role: 'ADMIN', password: PASSWORD } });

    const adminToken = await apiLogin(request, adminEmail);
    const denied = await request.put(`${API}/admin/users/${rootId}/role`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { role: 'USER', password: PASSWORD },
    });

    expect(denied.status()).toBe(403);
    expect((await denied.json()).code).toBe('ROOT_PROTECTED');
    await login(page, rootEmail, PASSWORD);
    await expect(adminNav(page)).toBeVisible();
    await adminContext.close();
  });
});
