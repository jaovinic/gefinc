import { APIRequestContext, Locator, Page, expect } from '@playwright/test';

export const API = 'http://localhost:8080/api/v1';
export const PASSWORD = 'senha-forte-123';

export interface TestUser {
  email: string;
  token: string;
  headers: { Authorization: string };
}

/** Cria um usuário novo pela API (a tela do app só é usada para o que está sendo verificado). */
export async function newUser(request: APIRequestContext): Promise<TestUser> {
  const email = `mobile.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
  await request.post(`${API}/auth/register`, { data: { email, password: PASSWORD } });
  const login = await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json();
  return { email, token: login.accessToken, headers: { Authorization: `Bearer ${login.accessToken}` } };
}

export async function apiPost(request: APIRequestContext, user: TestUser, path: string, data: unknown) {
  const response = await request.post(`${API}${path}`, { headers: user.headers, data });
  expect(response.ok(), `${path}: ${response.status()}`).toBeTruthy();
  return response.json();
}

export async function apiGet(request: APIRequestContext, user: TestUser, path: string) {
  const response = await request.get(`${API}${path}`, { headers: user.headers });
  expect(response.ok(), `${path}: ${response.status()}`).toBeTruthy();
  return response.json();
}

export async function signIn(page: Page, email: string) {
  await page.goto('/login');
  // espera o formulário ser ligado ao Angular (ng-pristine): preencher antes disso é perdido pela primeira detecção
  await expect(page.locator('input#email')).toHaveClass(/ng-pristine/);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
}

/** Abre uma área pela barra de abas inferior. */
export async function openTab(page: Page, label: string) {
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: label }).click();
}

/** Espera as animações de entrada (painéis sobem e aparecem) terminarem, para medir tamanhos e contraste no estado final. */
export async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
}

/** Abre o menu Mais (painel aberto pelo atalho Minha conta do cabeçalho) e devolve o diálogo. */
export async function openMore(page: Page): Promise<Locator> {
  await page.getByTestId('account-chip').click();
  const dialog = page.getByRole('dialog', { name: 'Mais', exact: true });
  await expect(dialog).toBeVisible();
  await settle(page);
  return dialog;
}

/** Abre uma área do menu Mais. */
export async function openFromMore(page: Page, label: string) {
  const dialog = await openMore(page);
  await dialog.getByRole('link', { name: label }).click();
  await expect(dialog).toHaveCount(0);
}

/** Id da categoria inicial pelo nome. */
export async function categoryId(request: APIRequestContext, user: TestUser, name: string): Promise<number> {
  const categories = (await apiGet(request, user, '/categories')) as { id: number; name: string }[];
  const found = categories.find((c) => c.name === name);
  expect(found, `categoria ${name}`).toBeTruthy();
  return found!.id;
}

/** Data local de hoje em ISO, como o app usa por padrão. */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Escolhe uma conta ou cartão no seletor com ícones (abre a lista e clica na opção pelo nome exato).
 * O rótulo do seletor muda por natureza ("Conta" na receita, "Conta ou cartão" na despesa), por isso
 * ele é achado pelo componente.
 */
export async function chooseAccount(page: Page, scope: Page | Locator, name: string) {
  await scope.locator('gef-account-picker button[aria-haspopup]').click();
  const exact = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  await page.locator('[role="option"]').filter({ has: page.locator('[data-name]', { hasText: exact }) }).click();
}

/**
 * O `gef-select` com o rótulo exato dado (visível ou oculto). O gatilho tem como nome o rótulo mais o valor atual
 * ("Parcelas 1x"), então nada de `getByRole('button', { name })` com o rótulo: use este campo ou `selectTrigger`.
 */
export function selectField(page: Page, scope: Page | Locator, label: string) {
  return scope.locator('gef-select').filter({ has: page.getByText(label, { exact: true }) });
}

/** O botão que abre a lista de um `gef-select`, pelo rótulo exato do campo. */
export function selectTrigger(page: Page, scope: Page | Locator, label: string) {
  return selectField(page, scope, label).locator('button[aria-haspopup="dialog"]');
}

/**
 * Escolhe uma opção num `gef-select` (a lista própria do app, no lugar do `<select>`): acha o campo pelo rótulo
 * (visível ou oculto, exato), abre a lista e clica na opção pelo texto exato. Espera a lista fechar, o que
 * garante que a escolha foi aplicada.
 */
export async function chooseOption(page: Page, scope: Page | Locator, label: string, optionText: string) {
  const field = selectField(page, scope, label);
  await field.locator('button[aria-haspopup="dialog"]').click();
  const option = field.getByRole('option', { name: optionText, exact: true });
  await expect(option).toBeVisible();
  await option.click();
  await expect(field.getByRole('option')).toHaveCount(0);
}

/** Preenche um campo de data próprio (`gef-date-field`) com uma data ISO: o campo recebe o texto dd/mm/aaaa, como o usuário digitaria. */
export async function fillDate(field: Locator, iso: string) {
  const [year, month, day] = iso.split('-');
  await field.fill(`${day}/${month}/${year}`);
}
