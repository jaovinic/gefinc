import { APIRequestContext, expect, test } from '@playwright/test';
import { PASSWORD, login, todayIso, uniqueEmail } from './support';

const API = 'http://localhost:8080/api/v1';

function futureIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Usuário novo pela API (a tela só é usada para o que está sendo verificado). */
async function newUser(request: APIRequestContext) {
  const email = uniqueEmail();
  await request.post(`${API}/auth/register`, { data: { email, password: PASSWORD } });
  const session = await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json();
  return { email, headers: { Authorization: `Bearer ${session.accessToken}` } };
}

type User = Awaited<ReturnType<typeof newUser>>;

async function post(request: APIRequestContext, user: User, path: string, data: unknown) {
  const response = await request.post(`${API}${path}`, { headers: user.headers, data });
  expect(response.ok(), `${path}: ${response.status()}`).toBeTruthy();
  return response.json();
}

async function get(request: APIRequestContext, user: User, path: string) {
  const response = await request.get(`${API}${path}`, { headers: user.headers });
  expect(response.ok(), `${path}: ${response.status()}`).toBeTruthy();
  return response.json();
}

async function categoryId(request: APIRequestContext, user: User, name: string): Promise<number> {
  const categories = (await get(request, user, '/categories')) as { id: number; name: string }[];
  return categories.find((c) => c.name === name)!.id;
}

/**
 * Itaú abre com R$ 1.000,00 e a Carteira com R$ 50,00; entram R$ 500,00 de receita hoje no Itaú e sai
 * uma despesa paga de R$ 200,00 da Carteira. Uma receita futura (R$ 300,00) ainda não conta.
 */
async function seed(request: APIRequestContext) {
  const user = await newUser(request);
  const itau = await post(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING', holderType: 'PF', openingBalance: '1000.00' });
  const wallet = await post(request, user, '/accounts', { name: 'Carteira', type: 'CASH', openingBalance: '50.00' });
  const salary = await categoryId(request, user, 'Salário');
  const food = await categoryId(request, user, 'Alimentação');
  const today = todayIso();
  const base = { recurrenceType: 'VARIABLE' };
  await post(request, user, '/transaction-groups', { ...base, description: 'Salário', totalAmount: '500.00', accountId: itau.id, categoryId: salary, purchaseDate: today, firstDueDate: today });
  await post(request, user, '/transaction-groups', { ...base, description: 'Mercado', totalAmount: '200.00', accountId: wallet.id, categoryId: food, purchaseDate: today, firstDueDate: today });
  const future = futureIso(5);
  await post(request, user, '/transaction-groups', { ...base, description: 'Freela', totalAmount: '300.00', accountId: itau.id, categoryId: salary, purchaseDate: future, firstDueDate: future });
  const list = (await get(request, user, '/transactions?size=100')) as { content: { id: number; description: string }[] };
  const market = list.content.find((t) => t.description === 'Mercado');
  await post(request, user, `/transactions/${market!.id}/pay`, { paymentDate: today });
  return user;
}

test.describe('saldo por conta', () => {
  test('o painel mostra o saldo geral (soma das contas) e o saldo de cada conta, sem a receita futura', async ({ page, request }) => {
    const user = await seed(request);
    await login(page, user.email, PASSWORD);

    const total = page.locator('[data-indicator="balance-total"]');
    await expect(total).toContainText('Saldo geral');
    await expect(total).toContainText('R$ 1.350,00');
    const rows = page.getByTestId('account-balance');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'Itaú' })).toContainText('R$ 1.500,00');
    await expect(rows.filter({ hasText: 'Carteira' })).toContainText('-R$ 150,00');
    await expect(page.getByText('até hoje,')).toBeVisible();
    await expect(page.locator('[data-indicator="to-receive"]')).toContainText('R$ 300,00');

    const api = await get(request, user, '/balances');
    expect(api.total).toBe('1350.00');
  });

  test('antecipar a receita futura em Lançamentos soma no saldo da conta', async ({ page, request }) => {
    const user = await seed(request);
    await login(page, user.email, PASSWORD);
    await expect(page.locator('[data-indicator="balance-total"]')).toContainText('R$ 1.350,00');

    await page.getByRole('link', { name: 'Lançamentos' }).click();
    if (futureIso(5).slice(0, 7) !== todayIso().slice(0, 7)) {
      await page.getByRole('button', { name: 'Próximo mês' }).click();
    }
    const row = page.getByRole('row', { name: /Freela/ });
    await expect(row).toContainText('A receber');
    await row.getByRole('button', { name: 'Antecipar recebimento' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByRole('row', { name: /Freela/ })).toContainText('Recebido');

    await page.getByRole('link', { name: 'Painel', exact: true }).click();
    await expect(page.locator('[data-indicator="balance-total"]')).toContainText('R$ 1.650,00');
  });

  test('o formulário de conta aceita um saldo inicial opcional e o painel o mostra', async ({ page, request }) => {
    const user = await newUser(request);
    await login(page, user.email, PASSWORD);
    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Nova conta' }).first().click();
    await page.getByLabel('Nome').fill('Inter');
    await page.locator('gef-account-form').getByLabel('Pessoa física').check();
    await page.getByLabel('Saldo inicial (opcional)').fill('25000'); // R$ 250,00
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('row', { name: /Inter/ })).toBeVisible();

    // cartão não tem saldo inicial
    await page.getByRole('button', { name: 'Nova conta' }).first().click();
    await page.getByLabel('Tipo').selectOption('CREDIT_CARD');
    await expect(page.getByLabel('Saldo inicial (opcional)')).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();

    await page.goto('/');
    await expect(page.locator('[data-indicator="balance-total"]')).toContainText('R$ 250,00');
    await expect(page.getByTestId('account-balance').filter({ hasText: 'Inter' })).toContainText('R$ 250,00');
  });

  test('conta que já começa devendo: saldo inicial negativo aparece na tela de Contas e no painel', async ({ page, request }) => {
    const user = await newUser(request);
    await login(page, user.email, PASSWORD);
    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Nova conta' }).first().click();
    await page.getByLabel('Nome').fill('Conta devedora');
    await page.locator('gef-account-form').getByLabel('Pessoa física').check();
    await page.getByLabel('Saldo inicial (opcional)').fill('30000'); // R$ 300,00
    await page.getByLabel('Negativo (devendo)').check();
    await page.getByRole('button', { name: 'Salvar' }).click();

    const row = page.getByRole('row', { name: /Conta devedora/ });
    await expect(row).toContainText('-R$ 300,00');

    await page.goto('/');
    await expect(page.locator('[data-indicator="balance-total"]')).toContainText('-R$ 300,00');

    // reabrir a conta mostra o valor e o sentido corretos
    await page.goto('/accounts');
    await page.getByRole('row', { name: /Conta devedora/ }).getByRole('button', { name: 'Editar' }).click();
    await expect(page.getByLabel('Negativo (devendo)')).toBeChecked();
    await expect(page.getByLabel('Saldo inicial (opcional)')).toHaveValue('300,00');
  });
});
