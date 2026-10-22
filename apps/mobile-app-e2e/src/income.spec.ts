import { APIRequestContext, Page, expect, test } from '@playwright/test';
import { apiGet, apiPost, newUser, openTab, signIn, type TestUser } from './support';

async function prepare(request: APIRequestContext) {
  const user = await newUser(request);
  await apiPost(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING', holderType: 'PF' });
  return user;
}

/** Conta os toques (cliques de verdade do usuário) a partir deste ponto. */
async function startCountingTaps(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __taps: number };
    w.__taps = 0;
    window.addEventListener('click', (e) => e.isTrusted && w.__taps++, true);
  });
}
const taps = (page: Page) => page.evaluate(() => (window as unknown as { __taps: number }).__taps);

test.describe('receita no celular', () => {
  test('"Nova receita" fica ao lado de "Nova despesa" e a receita é lançada em até 3 toques', async ({ page, request }) => {
    const user: TestUser = await prepare(request);
    await signIn(page, user.email);

    const expense = page.getByRole('link', { name: 'Nova despesa' });
    const income = page.getByRole('link', { name: 'Nova receita' });
    await expect(expense).toBeVisible();
    await expect(income).toBeVisible();
    const [a, b] = [await expense.boundingBox(), await income.boundingBox()];
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(4); // lado a lado
    expect(Math.abs(a!.height - b!.height)).toBeLessThan(4); // mesmo destaque

    await startCountingTaps(page);
    await income.click(); // toque 1
    await expect(page.getByRole('heading', { name: 'Nova receita' })).toBeVisible();
    await expect(page.getByLabel('Valor')).toBeFocused();
    await page.keyboard.type('500000');
    // só categorias de receita
    const options = await page.getByLabel('Categoria').locator('option').allTextContents();
    expect(options).toContain('Salário');
    expect(options).not.toContain('Alimentação');
    await page.getByRole('button', { name: 'Salvar' }).click(); // toque 2

    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
    expect(await taps(page)).toBeLessThanOrEqual(3);

    const groups = (await apiGet(request, user, '/transactions')) as { content: { description: string; amount: string; categoryId: number }[] };
    expect(groups.content.some((t) => t.amount === '5000.00')).toBe(true);

    // aparece como receita na lista de lançamentos
    await openTab(page, 'Lançamentos');
    await expect(page.getByTestId('transaction-card').filter({ hasText: 'R$ 5.000,00' })).toBeVisible();
  });

  test('o cadastro completo pede receita ou despesa logo no início', async ({ page, request }) => {
    const user = await prepare(request);
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');
    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    const form = page.locator('gef-group-form');
    const firstLabel = form.locator('legend, label').first();
    await expect(firstLabel).toContainText('Natureza');
    await form.getByLabel('Receita').check();
    await expect(form.getByLabel('Categoria').locator('option', { hasText: 'Salário' })).toHaveCount(1);
  });

  test('receita sem conexão é guardada e enviada uma única vez', async ({ page, request }) => {
    const user = await prepare(request);
    await signIn(page, user.email);
    await page.getByRole('link', { name: 'Nova receita' }).click();
    await page.keyboard.type('120000');
    await page.getByLabel('Descrição (opcional)').fill('Freela');
    await page.route('**/transaction-groups', (route) => route.abort('internetdisconnected'));
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByTestId('offline-banner')).toContainText('1 operação pendente de envio');

    await page.unroute('**/transaction-groups');
    await page.getByRole('button', { name: 'Sincronizar agora' }).click();
    await expect(page.getByTestId('offline-banner')).toHaveCount(0, { timeout: 20_000 });
    const list = (await apiGet(request, user, '/transactions')) as { content: { description: string }[] };
    expect(list.content.filter((t) => t.description === 'Freela')).toHaveLength(1);
  });
});
