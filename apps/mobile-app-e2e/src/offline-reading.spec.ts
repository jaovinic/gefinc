import { Page, expect, test } from '@playwright/test';
import { installNativeDoubles, setNetwork } from './native-doubles';
import { PASSWORD, apiGet, apiPost, categoryId, newUser, openFromMore, openMore, openTab, signIn, todayIso, chooseAccount, chooseOption, fillDate } from './support';

const card = (page: Page, description: string) => page.getByTestId('transaction-card').filter({ hasText: description });
const banner = (page: Page) => page.getByTestId('offline-banner');
const offlineView = (page: Page) => page.locator('gef-error [data-variant="offline"]');
const month = () => todayIso().slice(0, 7);

async function seed(request: Parameters<typeof newUser>[0], withCard = false, description = 'Mercado') {
  const user = await newUser(request);
  const itau = await apiPost(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING', holderType: 'PF' });
  const food = await categoryId(request, user, 'Alimentação');
  if (withCard) {
    const nubank = await apiPost(request, user, '/accounts', { name: 'Nubank', type: 'CREDIT_CARD', closingDay: 1, dueDay: 28, bankAccountId: itau.id });
    await apiPost(request, user, '/transaction-groups', {
      description: 'Notebook', recurrenceType: 'VARIABLE', totalAmount: '60.00', accountId: nubank.id, categoryId: food, purchaseDate: `${month()}-01`,
    });
  }
  await apiPost(request, user, '/transaction-groups', {
    description, recurrenceType: 'VARIABLE', totalAmount: '150.00', accountId: itau.id, categoryId: food,
    purchaseDate: todayIso(), firstDueDate: todayIso(),
  });
  return user;
}

/** Chaves guardadas na cópia local (IndexedDB do app); as chaves são `usuário|caminho?parâmetros`, só o conteúdo é cifrado. */
const cachedKeys = (page: Page) =>
  page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((d) => d.name === 'gefinc-cache')) {
      return [] as string[];
    }
    return new Promise<string[]>((resolve, reject) => {
      const open = indexedDB.open('gefinc-cache');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('entries')) {
          resolve([]);
          return;
        }
        const request = db.transaction('entries').objectStore('entries').getAllKeys();
        request.onsuccess = () => resolve(request.result as string[]);
        request.onerror = () => reject(request.error);
      };
    });
  });

test.describe('leitura sem conexão (fase A)', () => {
  test('sem cópia local o painel mostra o aviso de falta de conexão com "Tentar novamente", nunca "Sem lançamentos"; ao conectar, tentar de novo carrega', async ({ page, request }) => {
    const user = await seed(request);
    // o aparelho já nasce sem conexão: nada foi guardado ainda
    await installNativeDoubles(page, { network: { connected: false } });
    await signIn(page, user.email);

    const view = offlineView(page);
    await expect(view).toBeVisible();
    await expect(view).toContainText('Sem conexão');
    await expect(view).toContainText('Sem conexão e sem dados salvos desta tela');
    await expect(page.locator('main')).not.toContainText('Sem lançamentos');
    await expect(page.locator('main')).not.toContainText('Esta ação');

    await setNetwork(page, true);
    await view.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(page.locator('[data-indicator="total-month"]')).toContainText('R$ 150,00');
    await expect(offlineView(page)).toHaveCount(0);
  });

  test('sem cópia local, as outras abas também avisam a falta de conexão (e não "Nenhum lançamento/conta")', async ({ page, request }) => {
    const user = await seed(request);
    await installNativeDoubles(page, { network: { connected: false } });
    await signIn(page, user.email);

    for (const tab of ['Lançamentos', 'Faturas', 'Contas']) {
      await openTab(page, tab);
      await expect(offlineView(page).first()).toBeVisible();
      await expect(page.locator('main')).not.toContainText(/Nenhum lançamento|Nenhuma conta|Nenhum cartão|Fatura sem lançamentos/);
    }
    await openFromMore(page, 'Fluxo de caixa');
    await expect(offlineView(page)).toBeVisible();
  });

  test('com cópia local, mostra os dados e a data da última sincronização', async ({ page, request, context }) => {
    const user = await seed(request);
    await signIn(page, user.email);
    await expect(page.locator('[data-indicator="total-month"]')).toContainText('R$ 150,00');
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Mercado')).toBeVisible();

    await context.setOffline(true);
    await openTab(page, 'Painel');
    await expect(page.locator('[data-indicator="total-month"]')).toContainText('R$ 150,00');
    await expect(banner(page)).toContainText(/Dados de \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/);
    await expect(offlineView(page)).toHaveCount(0);
  });

  test('cópia de um painel vazio: diz "Sem lançamentos na última sincronização (dd/MM HH:mm)", não "neste mês"', async ({ page, request, context }) => {
    const user = await newUser(request); // conta nova, ainda sem lançamentos
    await signIn(page, user.email);
    await expect(page.getByText('Sem lançamentos neste mês')).toBeVisible();
    await openTab(page, 'Lançamentos');
    await expect(page.getByText('Nenhum lançamento neste mês')).toBeVisible();

    // enquanto isso, outro aparelho passa a ter dados; este aparelho perde a conexão
    await context.setOffline(true);
    await openTab(page, 'Painel');
    await expect(page.getByText(/Sem lançamentos na última sincronização \(\d{2}\/\d{2} \d{2}:\d{2}\)/)).toBeVisible();
    await expect(page.getByText('Sem lançamentos neste mês')).toHaveCount(0);
    await openTab(page, 'Lançamentos');
    await expect(page.getByText(/Nenhum lançamento na última sincronização \(\d{2}\/\d{2} \d{2}:\d{2}\)/)).toBeVisible();
  });

  test('o aquecimento guarda as abas depois do login: derruba a rede e as quatro abas abrem com dados que o usuário nunca abriu', async ({ page, request, context }) => {
    // No navegador as telas das abas são carregadas sob demanda (no app instalado o código já vem no pacote): um primeiro
    // usuário as visita com rede para o código existir; o que se verifica é a cópia do SEGUNDO usuário, que só passou pelo login.
    const first = await seed(request, false, 'Aluguel');
    await signIn(page, first.email);
    for (const tab of ['Lançamentos', 'Faturas', 'Contas']) {
      await openTab(page, tab);
    }
    await openFromMore(page, 'Fluxo de caixa');
    await openTab(page, 'Painel');
    await (await openMore(page)).getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();

    const second = await seed(request, true);
    await expect(page.locator('input#email')).toHaveClass(/ng-pristine/);
    await page.getByLabel('E-mail').fill(second.email);
    await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
    // o aquecimento acontece em ociosidade, logo depois do login; espera as últimas leituras entrarem na cópia
    await expect
      .poll(async () => (await cachedKeys(page)).filter((k) => k.includes('/invoices/projection') && k.includes('accountId=')).length, { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect((await cachedKeys(page)).some((k) => k.includes(`/transactions?month=${month()}&page=0&size=25`))).toBe(true);

    await context.setOffline(true);
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Mercado')).toBeVisible();
    await expect(card(page, 'Aluguel')).toHaveCount(0);
    await openTab(page, 'Faturas');
    await expect(page.locator('p:text-is("Total da fatura") + p')).toHaveText('R$ 60,00');
    await openTab(page, 'Contas');
    await expect(page.getByTestId('account-card')).toHaveCount(2);
    await expect(page.getByTestId('account-card').first()).toContainText('Itaú');
    await openFromMore(page, 'Fluxo de caixa');
    await expect(page.getByTestId('cashflow-card').first()).toBeVisible();
    await expect(offlineView(page)).toHaveCount(0);
  });

  test('conectado mas sem servidor (a API recusa): a cópia local responde, com a data dos dados', async ({ page, request }) => {
    const user = await seed(request);
    await installNativeDoubles(page, { network: { connected: true } });
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Mercado')).toBeVisible();

    await page.route(/\/api\/v1\/(?!auth)/, (route) => route.abort('connectionrefused'));
    await openTab(page, 'Painel');
    await expect(page.locator('[data-indicator="total-month"]')).toContainText('R$ 150,00');
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Mercado')).toBeVisible();
    await expect(banner(page)).toContainText('Dados de');
    await expect(offlineView(page)).toHaveCount(0);
  });

  test('conectado e a rede nunca responde (sem internet): depois de uns 3 s a cópia local responde, sem travar no carregando', async ({ page, request }) => {
    const user = await seed(request);
    await installNativeDoubles(page, { network: { connected: true } });
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Mercado')).toBeVisible();
    await expect.poll(async () => (await cachedKeys(page)).some((k) => k.includes('/transactions?')), { timeout: 20_000 }).toBe(true);

    await page.route(/\/api\/v1\/(?!auth)/, () => new Promise(() => undefined));
    await openTab(page, 'Painel');
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Mercado')).toBeVisible({ timeout: 15_000 });
    await expect(banner(page)).toContainText('Dados de');
  });

  test('servidor lento (responde em ~7 s): a cópia local responde aos 3 s e, quando a resposta chega, o aviso de dados antigos some', async ({ page, request }) => {
    const user = await seed(request);
    await installNativeDoubles(page, { network: { connected: true } });
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Mercado')).toBeVisible();
    await expect.poll(async () => (await cachedKeys(page)).some((k) => k.includes('/transactions?')), { timeout: 20_000 }).toBe(true);

    // a resposta demora mais que o limite de espera: a tela não fica esperando, mas o pedido não é jogado fora
    await page.route(/\/api\/v1\/(?!auth)/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 7_000));
      await route.continue().catch(() => undefined);
    });
    await openTab(page, 'Painel');
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Mercado')).toBeVisible({ timeout: 10_000 });
    await expect(banner(page)).toContainText('Dados de');
    await expect(banner(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(card(page, 'Mercado')).toBeVisible();
  });
});

test.describe('novo lançamento sem conexão', () => {
  test('mostra o aviso de falta de conexão e, ao salvar, diz que ficou no aparelho (e não "registrada")', async ({ page, request, context }) => {
    const user = await seed(request);
    await signIn(page, user.email);
    await expect(page.locator('[data-indicator="total-month"]')).toBeVisible();
    // no navegador a tela é carregada sob demanda (no app instalado o código já vem no pacote): abre uma vez com rede
    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await expect(page.getByLabel('Valor', { exact: true })).toBeFocused();
    await page.getByRole('link', { name: 'Cancelar' }).click();
    await expect(page.locator('[data-indicator="total-month"]')).toBeVisible();

    await context.setOffline(true);
    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await expect(page.getByLabel('Valor', { exact: true })).toBeFocused();
    const notice = page.getByTestId('offline-banner');
    await expect(notice).toContainText('Sem conexão');
    await expect(notice).toContainText('salvo no aparelho');

    await page.keyboard.type('1500');
    await page.getByLabel('Descrição (opcional)').fill('Lanche');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByTestId('toast')).toContainText('Salvo no aparelho; será enviado quando houver conexão.');
    await expect(page.getByTestId('toast')).not.toContainText('registrada');

    await context.setOffline(false);
    await expect(page.getByTestId('offline-banner')).toHaveCount(0, { timeout: 20_000 });
    const list = (await apiGet(request, user, `/transactions?month=${month()}&size=100`)) as { content: { description: string }[] };
    expect(list.content.filter((t) => t.description === 'Lanche')).toHaveLength(1);
  });

  test('com conexão o aviso não aparece e o toast continua "Despesa registrada."', async ({ page, request }) => {
    const user = await seed(request);
    await signIn(page, user.email);
    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await expect(page.getByLabel('Valor', { exact: true })).toBeFocused();
    await expect(page.getByTestId('offline-banner')).toHaveCount(0);
    await page.keyboard.type('1500');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByTestId('toast')).toContainText('Despesa registrada.');
  });
});

test.describe('reenvio quando a conexão volta mas ainda não há servidor', () => {
  test('o aparelho volta a ficar "conectado" com a API fora do ar: o envio é reagendado sozinho e chega uma única vez', async ({ page, request }) => {
    const user = await seed(request);
    await installNativeDoubles(page, { network: { connected: true } });
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Mercado')).toBeVisible();

    await setNetwork(page, false);
    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    const form = page.getByRole('dialog', { name: 'Novo lançamento' }).locator('gef-group-form');
    await form.getByLabel('Descrição ou loja').fill('Cinema');
    await chooseAccount(page, form, 'Itaú');
    await chooseOption(page, form, 'Categoria', 'Alimentação');
    await form.getByLabel('Valor').fill('4000');
    await fillDate(form.getByLabel(/vencimento/i), todayIso());
    await form.getByRole('button', { name: 'Salvar' }).click();
    await expect(banner(page)).toContainText('1 operação pendente de envio');

    // volta a "conexão" do aparelho, mas a API segue fora do ar: a primeira tentativa falha
    await page.route(/\/api\/v1\/transaction-groups/, (route) => route.abort('connectionrefused'));
    const failed = page.waitForEvent('requestfailed', (r) => r.url().includes('/transaction-groups') && r.method() === 'POST');
    await setNetwork(page, true);
    await failed;
    await expect(banner(page)).toContainText('1 operação pendente de envio');

    // a API volta: ninguém toca em nada, a nova tentativa agendada envia
    await page.unroute(/\/api\/v1\/transaction-groups/);
    await expect(banner(page)).toHaveCount(0, { timeout: 30_000 });
    const list = (await apiGet(request, user, `/transactions?month=${month()}&size=100`)) as { content: { description: string }[] };
    expect(list.content.filter((t) => t.description === 'Cinema')).toHaveLength(1);
  });
});
