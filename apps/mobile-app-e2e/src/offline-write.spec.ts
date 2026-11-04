import { APIRequestContext, Page, expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { API, TestUser, apiGet, apiPost, categoryId, chooseAccount, chooseOption, fillDate, newUser, openTab, signIn, todayIso, toApi } from './support';

/**
 * Uso sem internet, fase B: editar valor e vencimento e excluir lançamentos que já existem no servidor, e enviar
 * tudo (uma única vez) quando a conexão volta. Os dados de "outro aparelho" são alterados direto pela API.
 */

const card = (page: Page, description: string) => page.getByTestId('transaction-card').filter({ hasText: description });
const banner = (page: Page) => page.getByTestId('offline-banner');
const month = () => todayIso().slice(0, 7);

/** Um dia do mês corrente diferente de hoje, para o vencimento editado continuar no mesmo mês. */
function otherDayThisMonth(): string {
  const day = Number(todayIso().slice(8, 10)) === 27 ? '26' : '27';
  return `${month()}-${day}`;
}

async function seed(request: APIRequestContext) {
  const user = await newUser(request);
  const itau = await apiPost(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING', holderType: 'PF' });
  const food = await categoryId(request, user, 'Alimentação');
  const groups: Record<string, { id: number; transactions: { id: number; version: number }[] }> = {};
  for (const [description, amount] of [['Mercado', '150.00'], ['Luz', '90.50']]) {
    groups[description] = await apiPost(request, user, '/transaction-groups', {
      description, recurrenceType: 'VARIABLE', totalAmount: amount, accountId: itau.id, categoryId: food,
      purchaseDate: todayIso(), firstDueDate: todayIso(),
    });
  }
  return { user, groups };
}

const listOf = async (request: APIRequestContext, user: TestUser) =>
  ((await apiGet(request, user, `/transactions?month=${month()}&size=100`)) as {
    content: { id: number; description: string; amount: string; dueDate: string; version: number }[];
  }).content;

const find = async (request: APIRequestContext, user: TestUser, description: string) =>
  (await listOf(request, user)).filter((t) => t.description === description);

async function openWarm(page: Page, user: TestUser) {
  await signIn(page, user.email);
  await openTab(page, 'Lançamentos');
  await expect(card(page, 'Mercado')).toBeVisible();
  await expect(card(page, 'Luz')).toBeVisible();
  // a tela de painel também entra na cópia local (como no uso real) antes de a rede cair
  await openTab(page, 'Painel');
  await expect(page.locator('[data-indicator="total-month"]')).toBeVisible();
  await openTab(page, 'Lançamentos');
  await expect(card(page, 'Mercado')).toBeVisible();
}

async function editPanel(page: Page, description: string, cents: string, dueIso?: string) {
  await page.getByRole('button', { name: `Editar ${description}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Ação no lançamento' });
  await dialog.getByLabel('Valor').fill(cents);
  if (dueIso) {
    await fillDate(dialog.getByLabel(/vencimento/i), dueIso);
  }
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toHaveCount(0);
}

/** Conta as requisições do app que mudam lançamentos e devolve as chaves de idempotência usadas. */
function watchWrites(page: Page, method: string, pathPattern: RegExp) {
  const keys: (string | undefined)[] = [];
  page.on('request', (r) => {
    if (r.method() === method && pathPattern.test(new URL(r.url()).pathname)) {
      keys.push(r.headers()['idempotency-key']);
    }
  });
  return keys;
}

test.describe('editar e excluir sem internet', () => {
  test('editar valor e vencimento sem conexão: aparece marcado como pendente e chega ao servidor uma única vez', async ({ page, request, context }) => {
    const { user } = await seed(request);
    await openWarm(page, user);
    const patches = watchWrites(page, 'PATCH', /\/transactions\/\d+$/);
    await context.setOffline(true);

    await editPanel(page, 'Mercado', '17550', otherDayThisMonth());

    await expect(card(page, 'Mercado')).toContainText('R$ 175,50');
    await expect(card(page, 'Mercado')).toContainText('Pendente de envio');
    await expect(card(page, 'Mercado')).toContainText(otherDayThisMonth().split('-').reverse().join('/'));
    await expect(card(page, 'Luz')).not.toContainText('Pendente de envio');
    await expect(banner(page)).toContainText('1 operação pendente de envio');
    await expect(banner(page)).toContainText('Painel, faturas e fluxo de caixa ainda não incluem');
    // nada foi ao servidor
    expect((await find(request, user, 'Mercado'))[0]).toMatchObject({ amount: '150.00', dueDate: todayIso() });

    await context.setOffline(false);
    await expect(banner(page)).toHaveCount(0, { timeout: 20_000 });
    await expect(card(page, 'Mercado')).not.toContainText('Pendente de envio');

    const mercado = await find(request, user, 'Mercado');
    expect(mercado).toHaveLength(1);
    expect(mercado[0]).toMatchObject({ amount: '175.50', dueDate: otherDayThisMonth() });
    expect(patches).toHaveLength(1);
  });

  test('edições seguidas do mesmo lançamento, ainda sem conexão, viram uma só e valem as últimas', async ({ page, request, context }) => {
    const { user } = await seed(request);
    await openWarm(page, user);
    const patches = watchWrites(page, 'PATCH', /\/transactions\/\d+$/);
    await context.setOffline(true);

    await editPanel(page, 'Mercado', '20000');
    await expect(card(page, 'Mercado')).toContainText('R$ 200,00');
    await editPanel(page, 'Mercado', '31000');
    await expect(card(page, 'Mercado')).toContainText('R$ 310,00');

    await expect(banner(page)).toContainText('1 operação pendente de envio');
    await context.setOffline(false);
    await expect(banner(page)).toHaveCount(0, { timeout: 20_000 });

    expect((await find(request, user, 'Mercado'))[0].amount).toBe('310.00');
    expect(patches).toHaveLength(1);
  });

  test('excluir sem conexão: a confirmação avisa que será aplicado ao reconectar, o item some e a exclusão chega ao servidor', async ({ page, request, context }) => {
    const { user } = await seed(request);
    await openWarm(page, user);
    await context.setOffline(true);

    await page.getByRole('button', { name: 'Excluir Luz' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('será aplicada quando a conexão voltar');
    await dialog.getByRole('button', { name: 'Excluir "Luz"' }).click();

    await expect(card(page, 'Luz')).toHaveCount(0);
    await expect(card(page, 'Mercado')).toBeVisible();
    await expect(banner(page)).toContainText('1 operação pendente de envio');
    expect(await find(request, user, 'Luz')).toHaveLength(1);

    await context.setOffline(false);
    await expect(banner(page)).toHaveCount(0, { timeout: 20_000 });
    expect(await find(request, user, 'Luz')).toHaveLength(0);
    expect(await find(request, user, 'Mercado')).toHaveLength(1);
    await expect(card(page, 'Luz')).toHaveCount(0);
  });

  test('item criado sem conexão continua sem ações de editar e excluir até ser enviado', async ({ page, request, context }) => {
    const { user } = await seed(request);
    await openWarm(page, user);
    await context.setOffline(true);

    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    const form = page.getByRole('dialog', { name: 'Novo lançamento' }).locator('gef-group-form');
    await form.getByLabel('Descrição ou loja').fill('Padaria');
    await chooseAccount(page, form, 'Itaú');
    await chooseOption(page, form, 'Categoria', 'Alimentação');
    await form.getByLabel('Valor').fill('1200');
    await fillDate(form.getByLabel(/vencimento/i), todayIso());
    await form.getByRole('button', { name: 'Salvar' }).click();

    await expect(card(page, 'Padaria')).toContainText('Pendente de envio');
    await expect(card(page, 'Padaria').getByRole('button')).toHaveCount(0);
    // um item do servidor com alteração pendente, ao contrário, continua com as ações
    await editPanel(page, 'Mercado', '17550');
    await expect(card(page, 'Mercado').getByRole('button', { name: 'Excluir Mercado' })).toBeVisible();
    await expect(card(page, 'Mercado').getByRole('button', { name: 'Editar Mercado' })).toBeVisible();
  });
});

test.describe('envio confiável', () => {
  test('resposta perdida de uma edição: o reenvio devolve a resposta original, sem duplicar nem dar conflito falso de versão', async ({ page, request }) => {
    const { user, groups } = await seed(request);
    // só vale com o servidor que reconhece a chave nas edições (o antigo daria 409 no reenvio)
    const tx = groups['Mercado'].transactions[0];
    const probeKey = randomUUID();
    const probe = async () =>
      request.patch(`${API}/transactions/${tx.id}`, { headers: { ...user.headers, 'Idempotency-Key': probeKey }, data: { amount: '150.00', version: tx.version } });
    await probe();
    const replay = await probe();
    test.skip(replay.headers()['idempotent-replayed'] !== 'true', 'o servidor em uso ainda não aplica Idempotency-Key a PATCH');
    const current = (await find(request, user, 'Mercado'))[0];

    await openWarm(page, user);
    const sent = watchWrites(page, 'PATCH', /\/transactions\/\d+$/);
    let attempts = 0;
    // o servidor aplica, mas a resposta nunca chega ao app (no reenvio, o mesmo pedido segue ao servidor)
    await page.route('**/api/v1/transactions/*', async (route) => {
      if (route.request().method() !== 'PATCH') {
        return route.fallback();
      }
      attempts++;
      const response = await route.fetch({ url: toApi(route.request().url()) });
      if (attempts === 1) {
        return route.abort('connectionreset');
      }
      return route.fulfill({ response });
    });

    await editPanel(page, 'Mercado', '17550');
    await expect(banner(page)).toHaveCount(0, { timeout: 20_000 });

    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(new Set(sent).size).toBe(1);
    const after = await find(request, user, 'Mercado');
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ amount: '175.50' });
    // aplicou uma só vez: a versão avançou um passo
    expect(after[0].version).toBe(current.version + 1);
    // nada foi recusado
    await page.goto('/pendencias');
    await expect(page.getByText('Nenhuma pendência')).toBeVisible();
  });

  test('escrita enfileirada por falha de rede com o aparelho conectado é enviada na hora, sem esperar outro gatilho', async ({ page, request }) => {
    const { user, groups } = await seed(request);
    await openWarm(page, user);
    const attempts: { at: number; key: string | undefined }[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/transactions\/\d+\/pay$/.test(new URL(r.url()).pathname)) {
        attempts.push({ at: Date.now(), key: r.headers()['idempotency-key'] });
      }
    });
    let failures = 0;
    await page.route('**/api/v1/transactions/*/pay', async (route) => {
      if (failures++ === 0) {
        return route.abort('connectionrefused');
      }
      return route.continue();
    });

    await page.getByRole('button', { name: 'Pagar Mercado' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();

    // sem "Sincronizar agora": a segunda tentativa sai antes da primeira espera de reagendamento (2 s)
    await expect.poll(() => attempts.length, { timeout: 10_000 }).toBe(2);
    expect(attempts[1].at - attempts[0].at).toBeLessThan(1_500);
    expect(attempts[0].key).toBe(attempts[1].key);
    await expect(banner(page)).toHaveCount(0, { timeout: 10_000 });
    const tx = (await apiGet(request, user, `/transactions/${groups['Mercado'].transactions[0].id}`)) as { status: string };
    expect(tx.status).toBe('PAID');
  });

  test('envio que não responde (rede conectada sem internet) é abortado depois do limite, libera a fila e é reenviado com a mesma chave', async ({ page, request, context }) => {
    test.setTimeout(120_000);
    const { user } = await seed(request);
    await openWarm(page, user);
    const keys = watchWrites(page, 'PATCH', /\/transactions\/\d+$/);
    await context.setOffline(true);
    await editPanel(page, 'Mercado', '17550');
    await expect(banner(page)).toContainText('1 operação pendente de envio');

    let hung = 0;
    await page.route('**/api/v1/transactions/*', async (route) => {
      if (route.request().method() === 'PATCH' && hung++ === 0) {
        return; // nunca responde
      }
      return route.fallback();
    });
    await context.setOffline(false);

    // passado o limite de 30 s a tentativa é abortada e a operação volta; o reenvio (após a espera) é aceito
    await expect(banner(page)).toHaveCount(0, { timeout: 60_000 });
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(new Set(keys).size).toBe(1);
    expect((await find(request, user, 'Mercado'))[0].amount).toBe('175.50');
  });

  test('edição recusada pelo servidor (versão desatualizada) vai para as pendências com o motivo e não sobrescreve nada', async ({ page, request, context }) => {
    const { user, groups } = await seed(request);
    await openWarm(page, user);
    await context.setOffline(true);
    await editPanel(page, 'Luz', '20000');
    await expect(banner(page)).toContainText('1 operação pendente de envio');

    // enquanto isso, outro aparelho altera o mesmo lançamento
    const tx = groups['Luz'].transactions[0];
    const other = await request.patch(`${API}/transactions/${tx.id}`, { headers: user.headers, data: { amount: '95.00', version: tx.version } });
    expect(other.ok()).toBeTruthy();

    await context.setOffline(false);
    await expect(banner(page)).toContainText('1 operação recusada', { timeout: 20_000 });
    await page.getByRole('link', { name: 'Ver pendências' }).click();

    const rejected = page.getByTestId('rejected');
    await expect(rejected).toContainText('Editar lançamento');
    await expect(rejected).toContainText('alterado em outro dispositivo');
    await expect(rejected.getByRole('button', { name: /^Corrigir/ })).toHaveCount(0);
    // o valor do outro aparelho segue valendo
    expect((await find(request, user, 'Luz'))[0].amount).toBe('95.00');

    await rejected.getByRole('button', { name: /^Descartar/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar lançamento' }).click();
    await expect(page.getByText('Nenhuma pendência')).toBeVisible();
    expect((await find(request, user, 'Luz'))[0].amount).toBe('95.00');
  });

  test('desfazer pagamento e corrigir o valor sem conexão, com alteração externa no meio: a edição não herda a version nova, vai para as pendências e o valor do outro aparelho fica', async ({ page, request, context }) => {
    const { user, groups } = await seed(request);
    const tx = groups['Mercado'].transactions[0];
    await apiPost(request, user, `/transactions/${tx.id}/pay`, { paymentDate: todayIso() });
    await openWarm(page, user);
    await context.setOffline(true);

    await page.getByRole('button', { name: 'Desfazer Mercado' }).click();
    await editPanel(page, 'Mercado', '17550');
    await expect(banner(page)).toContainText('2 operações pendentes de envio');

    // outro aparelho desfaz, corrige para 95,00 e paga de novo: a version do servidor anda 3 passos
    const read = async () => (await apiGet(request, user, `/transactions/${tx.id}`)) as { version: number };
    await apiPost(request, user, `/transactions/${tx.id}/unpay`, undefined);
    const other = await request.patch(`${API}/transactions/${tx.id}`, { headers: user.headers, data: { amount: '95.00', version: (await read()).version } });
    expect(other.ok()).toBeTruthy();
    await apiPost(request, user, `/transactions/${tx.id}/pay`, { paymentDate: todayIso() });

    await context.setOffline(false);
    await expect(banner(page)).toContainText('1 operação recusada', { timeout: 20_000 });
    await page.getByRole('link', { name: 'Ver pendências' }).click();

    const rejected = page.getByTestId('rejected');
    await expect(rejected).toContainText('Editar lançamento');
    await expect(rejected).toContainText('alterado em outro dispositivo');
    // o desfazer foi aplicado; o valor do outro aparelho não foi sobrescrito
    const after = (await find(request, user, 'Mercado'))[0];
    expect(after.amount).toBe('95.00');
  });
});
