import { APIRequestContext, expect, test } from '@playwright/test';
import { apiGet, apiPost, categoryId, newUser, signIn, todayIso } from './support';

function futureIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Itaú abre com R$ 1.000,00 e a Carteira com R$ 50,00; entram R$ 500,00 de receita hoje no Itaú e sai
 * uma despesa paga de R$ 200,00 da Carteira. Uma receita futura (R$ 300,00) ainda não conta.
 */
async function seed(request: APIRequestContext) {
  const user = await newUser(request);
  const itau = await apiPost(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING', holderType: 'PF', openingBalance: '1000.00' });
  const wallet = await apiPost(request, user, '/accounts', { name: 'Carteira', type: 'CASH', openingBalance: '50.00' });
  const salary = await categoryId(request, user, 'Salário');
  const food = await categoryId(request, user, 'Alimentação');
  const today = todayIso();
  const base = { recurrenceType: 'VARIABLE' };
  await apiPost(request, user, '/transaction-groups', { ...base, description: 'Salário', totalAmount: '500.00', accountId: itau.id, categoryId: salary, purchaseDate: today, firstDueDate: today });
  await apiPost(request, user, '/transaction-groups', { ...base, description: 'Mercado', totalAmount: '200.00', accountId: wallet.id, categoryId: food, purchaseDate: today, firstDueDate: today });
  const future = futureIso(5);
  await apiPost(request, user, '/transaction-groups', { ...base, description: 'Freela', totalAmount: '300.00', accountId: itau.id, categoryId: salary, purchaseDate: future, firstDueDate: future });
  const list = (await apiGet(request, user, '/transactions?size=100')) as { content: { id: number; description: string }[] };
  const market = list.content.find((t) => t.description === 'Mercado');
  await apiPost(request, user, `/transactions/${market!.id}/pay`, { paymentDate: today });
  return user;
}

test.describe('saldo por conta no celular', () => {
  test('o painel mostra o saldo geral e uma linha por conta, sem contar a receita futura', async ({ page, request }) => {
    const user = await seed(request);
    await signIn(page, user.email);

    const total = page.locator('[data-indicator="balance-total"]');
    await expect(total).toContainText('Saldo geral');
    await expect(total).toContainText('R$ 1.350,00'); // 1.500,00 + (-150,00)
    const rows = page.getByTestId('account-balance');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'Itaú' })).toContainText('R$ 1.500,00');
    await expect(rows.filter({ hasText: 'Carteira' })).toContainText('-R$ 150,00');

    const api = await apiGet(request, user, '/balances');
    expect(api.total).toBe('1350.00');
  });

  test('lançar uma receita pela tela soma no saldo da conta ao voltar ao painel', async ({ page, request }) => {
    const user = await seed(request);
    await signIn(page, user.email);
    await expect(page.locator('[data-indicator="balance-total"]')).toContainText('R$ 1.350,00');

    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await page.getByLabel('Receita', { exact: true }).check();
    await page.keyboard.type('10000'); // R$ 100,00
    await page.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
    await expect(page.locator('[data-indicator="balance-total"]')).toContainText('R$ 1.450,00');
  });
});
