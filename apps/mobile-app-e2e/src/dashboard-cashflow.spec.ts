import { Page, expect, test } from '@playwright/test';
import { apiGet, apiPost, categoryId, newUser, openFromMore, openTab, signIn } from './support';

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/** "1380.50" -> "R$ 1.380,50", no mesmo formato do app. */
const brl = (value: string) => {
  const negative = value.startsWith('-');
  const [int, dec] = value.replace('-', '').split('.');
  return `${negative ? '-' : ''}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
};

const indicator = (page: Page, id: string) => page.locator(`[data-indicator="${id}"]`);

async function seed(request: Parameters<typeof newUser>[0]) {
  const user = await newUser(request);
  const itau = await apiPost(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING' });
  const nubank = await apiPost(request, user, '/accounts', { name: 'Nubank', type: 'CREDIT_CARD', closingDay: 1, dueDay: 28 });
  const food = await categoryId(request, user, 'Alimentação');
  const leisure = await categoryId(request, user, 'Lazer');
  const month = currentMonth();
  const base = { recurrenceType: 'VARIABLE', purchaseDate: `${month}-01` };
  await apiPost(request, user, '/transaction-groups', { ...base, description: 'Mercado', totalAmount: '150.00', accountId: itau.id, categoryId: food, firstDueDate: `${month}-02` });
  await apiPost(request, user, '/transaction-groups', { ...base, description: 'Cinema', totalAmount: '40.00', accountId: itau.id, categoryId: leisure, firstDueDate: `${month}-27` });
  await apiPost(request, user, '/transaction-groups', { ...base, description: 'Tênis', totalAmount: '210.50', accountId: nubank.id, categoryId: food });
  return { user, month };
}

test.describe('painel e fluxo de caixa no celular', () => {
  test('indicadores, gráficos e legendas batem com os valores da API (mesmos do web)', async ({ page, request }) => {
    const { user, month } = await seed(request);
    await signIn(page, user.email);

    const api = await apiGet(request, user, `/dashboard?month=${month}`);
    await expect(indicator(page, 'total-month')).toContainText(brl(api.totalMonth));
    await expect(indicator(page, 'to-due')).toContainText(brl(api.totalToDue));
    await expect(indicator(page, 'paid')).toContainText(brl(api.totalPaid));
    await expect(indicator(page, 'overdue')).toContainText(brl(api.overdueTotal));

    const categories = page.getByLabel('Legenda do gráfico por categoria');
    for (const c of api.byCategory as { name: string; amount: string }[]) {
      await expect(categories).toContainText(c.name);
      await expect(categories).toContainText(brl(c.amount));
    }
    const cards = page.getByLabel('Legenda do gráfico por cartão');
    for (const c of api.byCard as { name: string; amount: string }[]) {
      await expect(cards).toContainText(c.name);
      await expect(cards).toContainText(brl(c.amount));
    }
    await expect(page.getByRole('link', { name: '+ Nova despesa' })).toBeVisible();
  });

  test('trocar de mês atualiza tudo; mês vazio mostra o atalho para criar o primeiro lançamento', async ({ page, request }) => {
    const { user } = await seed(request);
    await signIn(page, user.email);
    await expect(indicator(page, 'total-month')).toBeVisible();

    await page.getByRole('button', { name: 'Próximo mês' }).click();
    await page.getByRole('button', { name: 'Próximo mês' }).click();
    await page.getByRole('button', { name: 'Próximo mês' }).click();
    await page.getByRole('button', { name: 'Próximo mês' }).click();
    await page.getByRole('button', { name: 'Próximo mês' }).click();
    await page.getByRole('button', { name: 'Próximo mês' }).click();
    await expect(page.getByText('Sem lançamentos neste mês')).toBeVisible();

    await page.getByRole('link', { name: 'Ir para lançamentos' }).click();
    await expect(page.getByRole('heading', { name: 'Lançamentos' })).toBeVisible();
  });

  test('o painel reflete na hora um pagamento feito em Lançamentos', async ({ page, request }) => {
    const { user, month } = await seed(request);
    await signIn(page, user.email);
    await expect(indicator(page, 'paid')).toContainText('R$ 0,00');

    await openTab(page, 'Lançamentos');
    await page.getByRole('button', { name: 'Pagar Mercado' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByTestId('transaction-card').filter({ hasText: 'Mercado' })).toContainText('Pago');

    await openTab(page, 'Painel');
    const api = await apiGet(request, user, `/dashboard?month=${month}`);
    expect(api.totalPaid).toBe('150.00');
    await expect(indicator(page, 'paid')).toContainText(brl(api.totalPaid));
  });

  test('fluxo de caixa: um cartão por mês com receitas, despesas e saldo residual da API', async ({ page, request }) => {
    const { user, month } = await seed(request);
    await signIn(page, user.email);

    await openFromMore(page, 'Fluxo de caixa');
    await expect(page.getByRole('heading', { name: 'Fluxo de caixa' })).toBeVisible();
    await expect(page.getByTestId('cashflow-card')).toHaveCount(12);

    const api = (await apiGet(request, user, `/cashflow?from=${month}&months=12`)) as {
      month: string; expectedIncome: string; expectedExpense: string; residual: string;
    }[];
    const first = page.getByTestId('cashflow-card').first();
    await expect(first).toContainText(api[0].month);
    await expect(first).toContainText(brl(api[0].expectedExpense));
    await expect(first).toContainText(brl(api[0].residual));
  });
});
