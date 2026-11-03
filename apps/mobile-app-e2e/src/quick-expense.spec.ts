import { APIRequestContext, Page, expect, test } from '@playwright/test';
import { apiGet, apiPost, chooseAccount, newUser } from './support';

const API = 'http://localhost:8080/api/v1';
const PASSWORD = 'senha-forte-123';

/** Cria o usuário e as contas pela API; o teste só usa a tela do app para o que está sendo medido. */
async function prepareUser(request: APIRequestContext) {
  const email = `mobile.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
  await request.post(`${API}/auth/register`, { data: { email, password: PASSWORD } });
  const login = await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json();
  const headers = { Authorization: `Bearer ${login.accessToken}` };
  await request.post(`${API}/accounts`, { headers, data: { name: 'Carteira', type: 'CASH' } });
  await request.post(`${API}/accounts`, { headers, data: { name: 'Itaú', type: 'CHECKING', holderType: 'PF' } });
  return email;
}

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
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

test.describe('novo lançamento rápido: despesa', () => {
  test('lança uma despesa com no máximo 3 toques a partir da tela inicial', async ({ page, request }) => {
    await signIn(page, await prepareUser(request));
    await startCountingTaps(page);

    await page.getByRole('link', { name: 'Novo lançamento' }).click(); // toque 1
    await expect(page.getByRole('heading', { name: 'Novo lançamento' })).toBeVisible();
    await expect(page.getByLabel('Despesa')).toBeChecked(); // a despesa é a natureza padrão
    await expect(page.getByLabel('Valor')).toBeFocused(); // o teclado numérico já está aberto
    await page.keyboard.type('2550'); // digitar não é toque
    await page.getByRole('button', { name: 'Salvar' }).click(); // toque 2

    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
    await expect(page.locator('[data-indicator="total-month"]')).toContainText('R$ 25,50');
    expect(await taps(page)).toBeLessThanOrEqual(3);
  });

  test('o último ajuste de conta e categoria vira o padrão da próxima despesa', async ({ page, request }) => {
    await signIn(page, await prepareUser(request));

    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await expect(page.getByLabel('Valor', { exact: true })).toBeFocused(); // a tela carrega sob demanda: espera abrir
    await page.keyboard.type('1000');
    await page.getByLabel('Descrição (opcional)').fill('Padaria');
    await chooseAccount(page, page, 'Itaú');
    await page.getByLabel('Categoria').selectOption({ label: 'Alimentação' });
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.locator('[data-indicator="total-month"]')).toContainText('R$ 10,00');

    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await expect(page.getByLabel('Conta ou cartão')).toContainText('Itaú');
    await expect(page.getByLabel('Categoria').locator('option:checked')).toHaveText('Alimentação');
  });

  test('o rodapé não é fixo: o botão Salvar rola junto com o formulário', async ({ page, request }) => {
    await signIn(page, await prepareUser(request));
    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    const position = await page.getByRole('button', { name: 'Salvar' }).evaluate((el) => {
      let node: Element | null = el;
      // o <body> do Ionic é sempre `fixed` (estrutura da casca); vale só o que está entre o botão e ele
      while (node && node !== document.body) {
        const p = getComputedStyle(node).position;
        if (p === 'fixed' || p === 'sticky') return p;
        node = node.parentElement;
      }
      return 'static';
    });
    expect(position).toBe('static');
  });

  test('sem o valor avisa e preserva o que já foi digitado', async ({ page, request }) => {
    await signIn(page, await prepareUser(request));

    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await page.getByLabel('Descrição (opcional)').fill('Mercado do bairro');
    await page.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByRole('alert')).toContainText('Informe o valor da despesa');
    await expect(page.getByLabel('Descrição (opcional)')).toHaveValue('Mercado do bairro');
  });

  test('falha de rede salva a despesa no aparelho e a envia quando a conexão volta', async ({ page, request }) => {
    await signIn(page, await prepareUser(request));

    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await expect(page.getByLabel('Valor', { exact: true })).toBeFocused(); // a tela carrega sob demanda: espera abrir
    await page.keyboard.type('4200');
    await page.getByLabel('Descrição (opcional)').fill('Farmácia');
    await page.route('**/transaction-groups', (route) => route.abort('internetdisconnected'));
    await page.getByRole('button', { name: 'Salvar' }).click();

    // nada se perde: a despesa fica guardada no aparelho, pendente de envio
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
    await expect(page.getByTestId('offline-banner')).toContainText('1 operação pendente de envio');

    await page.unroute('**/transaction-groups');
    await page.getByRole('button', { name: 'Sincronizar agora' }).click();
    await expect(page.getByTestId('offline-banner')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('[data-indicator="total-month"]')).toContainText('R$ 42,00');
  });
});

test.describe('novo lançamento rápido: parcelado no cartão', () => {
  test('lança "10 parcelas de R$ 100,00" e cada parcela cai na fatura do seu mês', async ({ page, request }) => {
    const user = await newUser(request);
    const bank = await apiPost(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING', holderType: 'PF' });
    await apiPost(request, user, '/accounts', { name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, bankAccountId: bank.id });
    await signIn(page, user.email);

    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await expect(page.getByLabel('Valor', { exact: true })).toBeFocused();
    await chooseAccount(page, page, 'Nubank');
    await expect(page.getByLabel('Parcelas')).toHaveValue('1');
    await page.getByLabel('Parcelas').selectOption('10');
    await page.getByLabel('Data', { exact: true }).fill('2026-11-05'); // antes do fechamento (dia 10)
    await page.getByLabel('Descrição (opcional)').fill('Geladeira');
    await page.getByLabel('Valor da parcela').click();
    await page.keyboard.type('10000');

    await expect(page.getByLabel('Valor da parcela')).toHaveValue('100,00');
    await expect(page.getByTestId('installment-summary')).toHaveText('10 × R$ 100,00 = R$ 1.000,00');
    const preview = page.getByTestId('installment-preview');
    await expect(preview).toContainText('1/10 · fatura de nov/2026 · vence 17/11 · R$ 100,00');
    await expect(preview).toContainText('10/10 · fatura de ago/2027 · vence 17/08 · R$ 100,00');
    await expect(page.getByTestId('date-hint')).toHaveText('1ª parcela na fatura que vence em 17/11/2026');

    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();

    type Row = { description: string; amount: string; dueDate: string; installmentNumber: number; totalInstallments: number };
    const first = (await apiGet(request, user, '/transactions?month=2026-11')) as { content: Row[] };
    expect(first.content).toHaveLength(1);
    expect(first.content[0]).toMatchObject({ description: 'Geladeira', amount: '100.00', dueDate: '2026-11-17', installmentNumber: 1, totalInstallments: 10 });
    const last = (await apiGet(request, user, '/transactions?month=2027-08')) as { content: Row[] };
    expect(last.content).toHaveLength(1);
    expect(last.content[0]).toMatchObject({ amount: '100.00', dueDate: '2027-08-17', installmentNumber: 10, totalInstallments: 10 });
  });

  test('compra após o fechamento vai para a fatura seguinte e o modo "Valor total" mostra o resto', async ({ page, request }) => {
    const user = await newUser(request);
    const bank = await apiPost(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING', holderType: 'PF' });
    await apiPost(request, user, '/accounts', { name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, bankAccountId: bank.id });
    await signIn(page, user.email);

    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await chooseAccount(page, page, 'Nubank');
    await page.getByLabel('Parcelas').selectOption('3');
    await page.getByLabel('Data', { exact: true }).fill('2026-11-12'); // depois do fechamento
    await page.getByRole('button', { name: 'Valor total' }).click();
    await page.keyboard.type('10000');

    await expect(page.getByTestId('installment-summary')).toHaveText('2 × R$ 33,33 + 1 × R$ 33,34');
    await expect(page.getByTestId('installment-preview')).toContainText('1/3 · fatura de dez/2026 · vence 17/12');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();

    const nov = (await apiGet(request, user, '/transactions?month=2026-11')) as { content: unknown[] };
    expect(nov.content).toHaveLength(0);
    const feb = (await apiGet(request, user, '/transactions?month=2027-02')) as { content: { amount: string }[] };
    expect(feb.content.map((t) => t.amount)).toEqual(['33.34']);
  });

  test('o campo Parcelas não aparece em conta bancária nem em receita', async ({ page, request }) => {
    await signIn(page, await prepareUser(request));
    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await expect(page.getByLabel('Parcelas')).toHaveCount(0);
    await page.getByLabel('Receita').check();
    await expect(page.getByLabel('Parcelas')).toHaveCount(0);
  });
});
