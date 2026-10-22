import { Page, expect, test } from '@playwright/test';
import { apiGet, apiPost, categoryId, newUser, openTab, signIn, todayIso, chooseAccount } from './support';

const card = (page: Page, description: string) => page.getByTestId('transaction-card').filter({ hasText: description });
const banner = (page: Page) => page.getByTestId('offline-banner');

async function seed(request: Parameters<typeof newUser>[0]) {
  const user = await newUser(request);
  const itau = await apiPost(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING', holderType: 'PF' });
  const food = await categoryId(request, user, 'Alimentação');
  for (const [description, amount] of [['Mercado', '150.00'], ['Luz', '90.50']]) {
    await apiPost(request, user, '/transaction-groups', {
      description, recurrenceType: 'VARIABLE', totalAmount: amount, accountId: itau.id, categoryId: food,
      purchaseDate: todayIso(), firstDueDate: todayIso(),
    });
  }
  return user;
}

async function newExpense(page: Page, description: string, cents: string) {
  await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
  const form = page.getByRole('dialog', { name: 'Novo lançamento' }).locator('gef-group-form');
  await form.getByLabel('Descrição ou loja').fill(description);
  await chooseAccount(page, form, 'Itaú');
  await form.getByLabel('Categoria').selectOption({ label: 'Alimentação' });
  await form.getByLabel('Valor').fill(cents);
  await form.getByLabel(/vencimento/i).fill(todayIso());
  await form.getByRole('button', { name: 'Salvar' }).click();
}

const countOf = async (request: Parameters<typeof newUser>[0], user: Awaited<ReturnType<typeof newUser>>, description: string) => {
  const page = (await apiGet(request, user, `/transactions?month=${todayIso().slice(0, 7)}&size=100`)) as { content: { description: string }[] };
  return page.content.filter((t) => t.description === description).length;
};

test.describe('uso sem internet', () => {
  test('consulta sem conexão, registra despesa e pagamento, e tudo chega uma única vez quando a conexão volta', async ({ page, request, context }) => {
    const user = await seed(request);
    await signIn(page, user.email);
    // aquece a cópia local com o que será consultado sem conexão
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Mercado')).toBeVisible();
    await openTab(page, 'Painel');
    await expect(page.locator('[data-indicator="total-month"]')).toBeVisible();

    await context.setOffline(true);

    // consulta com aviso e data da última sincronização
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Mercado')).toBeVisible();
    await expect(banner(page)).toContainText('Sem conexão');
    await expect(banner(page)).toContainText('Dados de');
    await openTab(page, 'Painel');
    await expect(page.locator('[data-indicator="total-month"]')).toBeVisible();

    // registra uma despesa e paga um item sem conexão
    await openTab(page, 'Lançamentos');
    await newExpense(page, 'Padaria', '1200');
    await expect(card(page, 'Padaria')).toContainText('Pendente de envio');
    await expect(banner(page)).toContainText('1 operação pendente de envio');
    await page.getByRole('button', { name: 'Pagar Mercado' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(card(page, 'Mercado')).toContainText('Pago');
    await expect(banner(page)).toContainText('2 operações pendentes de envio');
    await expect(banner(page)).toContainText('Painel, faturas e fluxo de caixa ainda não incluem');

    // ação que exige conexão: avisa e não perde nada
    await page.getByRole('button', { name: 'Excluir Luz' }).click();
    await expect(page.getByRole('alert')).toContainText('precisa de conexão');
    await expect(card(page, 'Luz')).toBeVisible();

    // item ainda não enviado não oferece ações
    await expect(card(page, 'Padaria').getByRole('button')).toHaveCount(0);

    // a conexão volta: envia sozinho
    await context.setOffline(false);
    await expect(banner(page)).toHaveCount(0, { timeout: 20_000 });
    await expect(card(page, 'Padaria')).not.toContainText('Pendente de envio');
    await expect(card(page, 'Mercado')).toContainText('Pago');

    expect(await countOf(request, user, 'Padaria')).toBe(1);
    const mercado = ((await apiGet(request, user, `/transactions?month=${todayIso().slice(0, 7)}&size=100`)) as { content: { description: string; status: string }[] }).content.find((t) => t.description === 'Mercado');
    expect(mercado?.status).toBe('PAID');
  });

  test('envio interrompido com resposta perdida e reenviado não duplica o lançamento', async ({ page, request }) => {
    const user = await seed(request);
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Mercado')).toBeVisible();

    // o servidor registra, mas a resposta nunca chega ao app
    await page.route('**/api/v1/transaction-groups', async (route) => {
      await route.fetch();
      await route.abort('connectionreset');
    });
    await newExpense(page, 'Notebook', '300000');
    // o app não sabe que o servidor registrou: mostra o item como pendente (junto do que o servidor já tem)
    await expect(card(page, 'Notebook').filter({ hasText: 'Pendente de envio' })).toHaveCount(1);
    expect(await countOf(request, user, 'Notebook')).toBe(1);

    await page.unroute('**/api/v1/transaction-groups');
    await page.getByRole('button', { name: 'Sincronizar agora' }).click();
    await expect(banner(page)).toHaveCount(0, { timeout: 20_000 });

    expect(await countOf(request, user, 'Notebook')).toBe(1);
    // depois do reenvio, a lista mostra um só Notebook, já confirmado
    await expect(card(page, 'Notebook')).toHaveCount(1);
    await expect(card(page, 'Notebook')).not.toContainText('Pendente de envio');
  });

  test('a fila sobrevive a fechar e reabrir o app', async ({ page, request }) => {
    const user = await seed(request);
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Mercado')).toBeVisible();

    // a API fica inacessível (o app ainda carrega do servidor local)
    await page.route('**/api/v1/**', (route) => route.abort('connectionrefused'));
    await newExpense(page, 'Cinema', '4000');
    await expect(banner(page)).toContainText('1 operação pendente de envio');

    await page.reload();
    await expect(banner(page)).toContainText('1 operação pendente de envio');

    await page.unroute('**/api/v1/**');
    await page.getByRole('button', { name: 'Sincronizar agora' }).click();
    await expect(banner(page)).toHaveCount(0, { timeout: 20_000 });
    expect(await countOf(request, user, 'Cinema')).toBe(1);
  });

  test('operação recusada pelo servidor aparece com o motivo e pode ser descartada', async ({ page, request, context }) => {
    const user = await seed(request);
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Mercado')).toBeVisible();
    await context.setOffline(true);
    await newExpense(page, 'Farmácia', '2500');
    await expect(banner(page)).toContainText('1 operação pendente de envio');

    // enquanto isso, a conta é inativada em outro aparelho
    const accounts = (await apiGet(request, user, '/accounts')) as { id: number; name: string; type: string; version: number }[];
    const itau = accounts.find((a) => a.name === 'Itaú')!;
    const put = await request.put(`http://localhost:8080/api/v1/accounts/${itau.id}`, {
      headers: user.headers, data: { name: 'Itaú', type: 'CHECKING', holderType: 'PF', active: false, version: itau.version },
    });
    expect(put.ok()).toBeTruthy();

    await context.setOffline(false);
    await expect(banner(page)).toContainText('1 operação recusada', { timeout: 20_000 });

    await page.getByRole('link', { name: 'Ver pendências' }).click();
    await expect(page.getByRole('heading', { name: 'Pendências de envio' })).toBeVisible();
    const rejected = page.getByTestId('rejected');
    await expect(rejected).toContainText('Farmácia');
    await expect(rejected).toContainText(/inativ/i);

    await page.getByRole('button', { name: 'Descartar Farmácia' }).click();
    await expect(page.getByText('Nenhuma pendência')).toBeVisible();
    expect(await countOf(request, user, 'Farmácia')).toBe(0);
  });

  test('sair com operações não enviadas pede confirmação e só descarta se o usuário aceitar', async ({ page, request }) => {
    const user = await seed(request);
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Mercado')).toBeVisible();
    await page.route('**/api/v1/**', (route) => route.abort('connectionrefused'));
    await newExpense(page, 'Livraria', '8000');
    await expect(banner(page)).toContainText('1 operação pendente de envio');

    await openTab(page, 'Mais');
    await page.getByRole('main').getByRole('button', { name: 'Sair' }).click();
    const dialog = page.getByRole('dialog', { name: 'Operações não enviadas' });
    await expect(dialog).toContainText('1 operação');
    await dialog.getByRole('button', { name: 'Voltar' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(banner(page)).toContainText('1 operação pendente de envio');

    await page.getByRole('main').getByRole('button', { name: 'Sair' }).click();
    await page.getByRole('dialog', { name: 'Operações não enviadas' }).getByRole('button', { name: 'Sair e descartar' }).click();
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  });
});
