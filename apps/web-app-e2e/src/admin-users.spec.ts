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

/** Cadastra pela API e, se pedido, dá um nome de exibição (o painel busca por nome também). */
async function createUser(request: APIRequestContext, email: string, name?: string) {
  const response = await request.post(`${API}/auth/register`, { data: { email, password: PASSWORD }, headers: { 'X-Client': 'web' } });
  expect(response.status()).toBe(201);
  const id = (await response.json()).id as number;
  if (name) {
    const token = await apiLogin(request, email);
    const renamed = await request.patch(`${API}/auth/me`, { data: { name }, headers: { Authorization: `Bearer ${token}` } });
    expect(renamed.ok()).toBe(true);
  }
  return id;
}

const rows = (page: Page) => page.getByTestId('user-row');
const search = (page: Page) => page.getByLabel('Buscar por e-mail ou nome');

test.describe('painel: lista e detalhe de usuários', () => {
  let stamp: string;
  let rootEmail: string;
  let joaoEmail: string;
  let mariaEmail: string;
  let joaoId: number;

  test.beforeEach(async ({ page, request }) => {
    stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    rootEmail = `raiz.${stamp}@example.com`;
    joaoEmail = `contato.${stamp}@example.com`;
    mariaEmail = `maria.${stamp}@example.com`;
    await register(page, rootEmail);
    promoteToRoot(rootEmail);
    joaoId = await createUser(request, joaoEmail, `João Teste ${stamp}`);
    await createUser(request, mariaEmail, `Maria Teste ${stamp}`);
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Administração', exact: true })).toBeVisible();
    await expect(rows(page).first()).toBeVisible();
  });

  test('busca por parte do e-mail e do nome, sem diferenciar caixa nem acento', async ({ page }) => {
    await search(page).fill(`JOAO teste ${stamp}`);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText(joaoEmail);
    await expect(page.getByTestId('result-status')).toHaveText('1 usuário encontrado. Página 1 de 1.');

    await search(page).fill(`MARIA.${stamp}@EXAMPLE`);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText(mariaEmail);

    await search(page).fill(`${stamp}`);
    await expect(rows(page)).toHaveCount(3);
  });

  test('filtra por situação, mostra o estado vazio e "Limpar filtros" volta à lista', async ({ page }) => {
    await search(page).fill(stamp);
    await expect(rows(page)).toHaveCount(3);

    await chooseOption(page, page, 'Situação', 'Administradores');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText(rootEmail);
    await expect(rows(page).first().getByTestId('role')).toHaveText('Administrador raiz');
    await expect(page.getByTestId('counts')).toContainText('Administradores');

    await chooseOption(page, page, 'Situação', 'Suspensos');
    await expect(page.getByText('Nenhum usuário encontrado', { exact: true })).toBeVisible();
    await expect(page.getByTestId('result-status')).toHaveText('Nenhum usuário encontrado.');

    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(search(page)).toHaveValue('');
    await expect(rows(page).first()).toBeVisible();
  });

  test('ordena por criação, do mais novo ao mais antigo e o contrário', async ({ page }) => {
    await search(page).fill(stamp);
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).first()).toContainText(mariaEmail);

    await chooseOption(page, page, 'Ordem', 'Mais antigos primeiro');
    await expect(rows(page).first()).toContainText(rootEmail);
    await expect(rows(page).last()).toContainText(mariaEmail);

    await chooseOption(page, page, 'Ordenar por', 'Último acesso');
    await expect(rows(page)).toHaveCount(3);
  });

  test('cada linha mostra a situação em texto e ícone, e a lista não oferece exportar', async ({ page }) => {
    await search(page).fill(stamp);
    await expect(rows(page)).toHaveCount(3);

    const status = rows(page).first().getByTestId('status');
    await expect(status).toHaveText('Ativo');
    await expect(status.locator('gef-icon svg').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /exportar/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /exportar/i })).toHaveCount(0);
    expect(await violations(page), 'lista de usuários').toEqual([]);
  });

  test('abre o detalhe sem nenhum dado financeiro e registra a abertura na auditoria', async ({ page, request }) => {
    await search(page).fill(`contato.${stamp}`);
    await expect(rows(page)).toHaveCount(1);
    await rows(page).first().getByRole('link', { name: joaoEmail }).click();

    await expect(page).toHaveURL(new RegExp(`/admin/users/${joaoId}$`));
    const heading = page.getByTestId('detail-heading');
    await expect(heading).toHaveText(`João Teste ${stamp}`);
    await expect(heading).toBeFocused();
    await expect(page.getByTestId('email')).toHaveText(joaoEmail);
    await expect(page.getByTestId('status')).toHaveText('Ativo');
    await expect(page.getByTestId('open-sessions')).toBeVisible();
    await expect(page.getByTestId('login-lock')).toHaveText('Sem bloqueio');
    await expect(page.getByTestId('deletion')).toHaveText('Sem exclusão pendente');

    const content = (await page.locator('main, [data-testid="admin-panel"]').first().innerText()).toLowerCase();
    for (const word of ['saldo', 'lançamento', 'cartão', 'transferência', 'categoria', 'exportar']) {
      expect(content, `a tela não pode mostrar "${word}"`).not.toContain(word);
    }
    await expect(page.getByRole('button', { name: /exportar/i })).toHaveCount(0);
    expect(await violations(page), 'detalhe do usuário').toEqual([]);

    // Abrir o detalhe é auditado: a segunda leitura já traz a primeira abertura no histórico.
    const token = await apiLogin(request, rootEmail);
    const response = await request.get(`${API}/admin/users/${joaoId}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status()).toBe(200);
    const detail = await response.json();
    const opened = (detail.recentActions as { action: string }[]).filter((a) => a.action === 'USER_DETAIL_OPENED');
    expect(opened.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(detail)).not.toMatch(/"ip"/);
  });

  test('o raiz aparece como administrador raiz protegido', async ({ page }) => {
    await search(page).fill(`raiz.${stamp}`);
    await expect(rows(page)).toHaveCount(1);
    await rows(page).first().getByRole('link', { name: rootEmail }).click();

    await expect(page.getByTestId('protected')).toHaveText('Administrador raiz protegido');
  });

  test('usuário inexistente mostra a mensagem e leva de volta à lista', async ({ page }) => {
    await page.goto('/admin/users/999999999');

    await expect(page.getByRole('alert').filter({ hasText: 'Usuário não encontrado' })).toBeVisible();
    await page.getByRole('link', { name: 'Voltar para a lista' }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
  });

  test('paginação mostra "Página X de Y" e começa na primeira página (a troca de página e o foco são cobertos no Jest)', async ({ page }) => {
    const pager = page.getByRole('navigation', { name: 'Paginação' });

    await expect(pager).toContainText(/Página 1 de \d+/);
    await expect(pager.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await expect(pager.getByRole('button', { name: 'Próxima' })).toBeVisible();
  });
});
