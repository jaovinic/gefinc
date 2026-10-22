import { APIRequestContext, Page, expect, test } from '@playwright/test';
import { chooseAccount } from './support';

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

test.describe('lançamento rápido de despesa', () => {
  test('lança uma despesa com no máximo 3 toques a partir da tela inicial', async ({ page, request }) => {
    await signIn(page, await prepareUser(request));
    await startCountingTaps(page);

    await page.getByRole('link', { name: 'Nova despesa' }).click(); // toque 1
    await expect(page.getByRole('heading', { name: 'Nova despesa' })).toBeVisible();
    await expect(page.getByLabel('Valor')).toBeFocused(); // o teclado numérico já está aberto
    await page.keyboard.type('2550'); // digitar não é toque
    await page.getByRole('button', { name: 'Salvar' }).click(); // toque 2

    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
    await expect(page.locator('[data-indicator="total-month"]')).toContainText('R$ 25,50');
    expect(await taps(page)).toBeLessThanOrEqual(3);
  });

  test('o último ajuste de conta e categoria vira o padrão da próxima despesa', async ({ page, request }) => {
    await signIn(page, await prepareUser(request));

    await page.getByRole('link', { name: 'Nova despesa' }).click();
    await page.keyboard.type('1000');
    await page.getByLabel('Descrição (opcional)').fill('Padaria');
    await chooseAccount(page, page, 'Itaú');
    await page.getByLabel('Categoria').selectOption({ label: 'Alimentação' });
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.locator('[data-indicator="total-month"]')).toContainText('R$ 10,00');

    await page.getByRole('link', { name: 'Nova despesa' }).click();
    await expect(page.getByLabel('Conta ou cartão')).toContainText('Itaú');
    await expect(page.getByLabel('Categoria').locator('option:checked')).toHaveText('Alimentação');
  });

  test('sem o valor avisa e preserva o que já foi digitado', async ({ page, request }) => {
    await signIn(page, await prepareUser(request));

    await page.getByRole('link', { name: 'Nova despesa' }).click();
    await page.getByLabel('Descrição (opcional)').fill('Mercado do bairro');
    await page.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByRole('alert')).toContainText('Informe o valor da despesa');
    await expect(page.getByLabel('Descrição (opcional)')).toHaveValue('Mercado do bairro');
  });

  test('falha de rede salva a despesa no aparelho e a envia quando a conexão volta', async ({ page, request }) => {
    await signIn(page, await prepareUser(request));

    await page.getByRole('link', { name: 'Nova despesa' }).click();
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
