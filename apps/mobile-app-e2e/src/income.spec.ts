import { APIRequestContext, Page, expect, test } from '@playwright/test';
import { apiGet, apiPost, categoryId, chooseAccount, newUser, openTab, signIn, todayIso, type TestUser } from './support';

async function prepare(request: APIRequestContext) {
  const user = await newUser(request);
  const bank = await apiPost(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING', holderType: 'PF' });
  await apiPost(request, user, '/accounts', { name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, bankAccountId: bank.id });
  return user;
}

/** Dia futuro em ISO (a receita futura só entra na conta quando a data chega). */
function futureIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

test.describe('receita no celular (novo lançamento unificado)', () => {
  test('um único "Novo lançamento" na tela inicial; a receita é lançada em até 3 toques', async ({ page, request }) => {
    const user: TestUser = await prepare(request);
    await signIn(page, user.email);

    await expect(page.getByRole('link', { name: 'Novo lançamento' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Nova despesa' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Nova receita' })).toHaveCount(0);

    await startCountingTaps(page);
    await page.getByRole('link', { name: 'Novo lançamento' }).click(); // toque 1
    await expect(page.getByRole('heading', { name: 'Novo lançamento' })).toBeVisible();
    await page.getByLabel('Receita').check(); // toque 2: escolher a natureza
    await expect(page.getByLabel('Valor')).toBeFocused(); // o valor volta a ter o foco: o teclado segue aberto
    await page.keyboard.type('500000');
    // só categorias de receita, e a conta nunca lista cartão
    const options = await page.getByLabel('Categoria').locator('option').allTextContents();
    expect(options).toContain('Salário');
    expect(options).not.toContain('Alimentação');
    await page.getByRole('button', { name: 'Salvar' }).click(); // toque 3

    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
    expect(await taps(page)).toBeLessThanOrEqual(3);

    const list = (await apiGet(request, user, '/transactions')) as { content: { amount: string; status: string }[] };
    // receita de hoje já entra na conta: sem "marcar como recebida"
    expect(list.content.find((t) => t.amount === '5000.00')?.status).toBe('PAID');

    await openTab(page, 'Lançamentos');
    const card = page.getByTestId('transaction-card').filter({ hasText: 'R$ 5.000,00' });
    await expect(card).toContainText('Recebido');
    await expect(card.getByRole('button', { name: /Receber|Antecipar/ })).toHaveCount(0);
  });

  test('o endereço antigo de nova receita abre o novo lançamento já em Receita', async ({ page, request }) => {
    const user = await prepare(request);
    await signIn(page, user.email);
    await page.goto('/quick-income');
    await expect(page).toHaveURL(/\/novo\?tipo=receita/);
    await expect(page.getByLabel('Receita')).toBeChecked();
  });

  test('receita não aceita cartão: a lista de contas só mostra contas e trocar a natureza troca o cartão escolhido', async ({ page, request }) => {
    const user = await prepare(request);
    await signIn(page, user.email);
    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await chooseAccount(page, page, 'Nubank');
    await expect(page.locator('gef-account-picker button[aria-haspopup]')).toContainText('Nubank');

    await page.getByLabel('Receita').check();
    await expect(page.locator('gef-account-picker button[aria-haspopup]')).toContainText('Itaú');
    await expect(page.getByTestId('account-notice')).toContainText('Cartão não recebe receita');

    await page.locator('gef-account-picker button[aria-haspopup]').click();
    await expect(page.locator('[role="option"]').filter({ hasText: 'Nubank' })).toHaveCount(0);
    await expect(page.locator('[role="option"]').filter({ hasText: 'Itaú' })).toHaveCount(1);
  });

  test('receita de data futura fica "A receber" e pode ser antecipada em Lançamentos', async ({ page, request }) => {
    const user = await prepare(request);
    const future = futureIso(3);
    const accounts = (await apiGet(request, user, '/accounts')) as { id: number; type: string }[];
    await apiPost(request, user, '/transaction-groups', {
      description: 'Freela futuro', recurrenceType: 'VARIABLE', totalAmount: '800.00', accountId: accounts.find((a) => a.type === 'CHECKING')!.id,
      categoryId: await categoryId(request, user, 'Salário'), purchaseDate: future, firstDueDate: future,
    });
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');
    // a data futura pode cair no mês seguinte no fim do mês
    if (future.slice(0, 7) !== todayIso().slice(0, 7)) {
      await page.getByRole('button', { name: 'Próximo mês' }).click();
    }
    const card = page.getByTestId('transaction-card').filter({ hasText: 'Freela futuro' });
    await expect(card).toContainText('A receber');

    await card.getByRole('button', { name: /Antecipar recebimento/ }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByTestId('transaction-card').filter({ hasText: 'Freela futuro' })).toContainText('Recebido');
    // antecipada, ainda de data futura: pode voltar a "A receber"
    await expect(page.getByTestId('transaction-card').filter({ hasText: 'Freela futuro' }).getByRole('button', { name: /Desfazer/ })).toBeVisible();
  });

  test('o cadastro completo pede receita ou despesa logo no início e a receita tem uma só data', async ({ page, request }) => {
    const user = await prepare(request);
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');
    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    const form = page.locator('gef-group-form');
    await expect(form.locator('legend, label').first()).toContainText('Natureza');
    await form.getByLabel('Receita').check();
    await expect(form.getByLabel('Categoria').locator('option', { hasText: 'Salário' })).toHaveCount(1);
    await expect(form.getByLabel('Data do recebimento')).toBeVisible();
    await expect(form.getByLabel('Data da compra')).toHaveCount(0);
    await expect(form.getByLabel(/vencimento/i)).toHaveCount(0);
    await expect(form.getByText('Entra na conta hoje')).toBeVisible();
  });

  test('receita sem conexão é guardada e enviada uma única vez', async ({ page, request }) => {
    const user = await prepare(request);
    await signIn(page, user.email);
    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await page.getByLabel('Receita').check();
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
