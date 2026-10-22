import { expect, test } from '@playwright/test';
import { apiGet, apiPost, categoryId, newUser, openFromMore, openTab, signIn } from './support';

test.describe('contas, cartões e categorias no celular', () => {
  test('cria conta e cartão (dias inválidos recusados sem perder o digitado), edita e inativa', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);

    await openTab(page, 'Contas');
    await expect(page.getByRole('heading', { name: 'Contas e cartões' })).toBeVisible();
    await expect(page.getByText('Nenhuma conta cadastrada')).toBeVisible();

    // conta bancária
    await page.getByRole('button', { name: 'Nova conta' }).first().click();
    await page.getByLabel('Nome').fill('Itaú');
    await page.locator('gef-account-form').getByLabel('Pessoa física').check();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByTestId('account-card').filter({ hasText: 'Itaú' })).toContainText('Conta bancária');

    // cartão com dia inválido: avisa e mantém o que foi digitado
    await page.getByRole('button', { name: 'Nova conta' }).first().click();
    await page.getByLabel('Nome').fill('Nubank');
    await page.getByLabel('Tipo').selectOption('CREDIT_CARD');
    await page.getByLabel('Conta bancária').click();
    await page.locator('[role="option"]').filter({ hasText: 'Itaú' }).click();
    await page.getByLabel('Dia de fechamento da fatura').fill('32');
    await page.getByLabel('Dia de vencimento da fatura').fill('17');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Informe um dia entre 1 e 31.')).toBeVisible();
    await expect(page.getByLabel('Nome')).toHaveValue('Nubank');
    await page.getByLabel('Dia de fechamento da fatura').fill('10');
    await page.getByRole('button', { name: 'Salvar' }).click();
    const nubank = page.getByTestId('account-card').filter({ hasText: 'Nubank' });
    await expect(nubank).toContainText('Fecha dia 10');
    await expect(nubank).toContainText('vence dia 17');

    // edição de cartão avisa o efeito sobre as ocorrências fixas
    await page.getByRole('button', { name: 'Editar Nubank' }).click();
    await expect(page.getByTestId('card-days-notice')).toContainText('lançamentos fixos pendentes');
    await page.getByLabel('Nome').fill('Nubank Roxinho');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByTestId('account-card').filter({ hasText: 'Nubank Roxinho' })).toBeVisible();

    // inativar tira da lista; "Mostrar inativas" traz de volta
    // (o Itaú tem o cartão vinculado: o app avisa antes de inativar)
    const itau = page.getByTestId('account-card').filter({ has: page.locator('[data-name]', { hasText: /^Itaú$/ }) });
    await page.getByRole('button', { name: 'Inativar Itaú' }).click();
    await expect(page.getByRole('dialog')).toContainText('Nubank Roxinho');
    await page.getByRole('button', { name: 'Inativar mesmo assim' }).click();
    await expect(itau).toHaveCount(0);
    await page.getByLabel('Mostrar inativas').check();
    await expect(itau).toContainText('Inativa');

    // o que foi criado no app aparece igual na API (mesmos dados do web)
    const accounts = (await apiGet(request, user, '/accounts?includeInactive=true')) as { name: string; type: string; closingDay?: number }[];
    expect(accounts.map((a) => a.name).sort()).toEqual(['Itaú', 'Nubank Roxinho']);
    expect(accounts.find((a) => a.name === 'Nubank Roxinho')).toMatchObject({ type: 'CREDIT_CARD', closingDay: 10 });
  });

  test('conta com lançamentos não pode ser excluída: o app orienta a inativar', async ({ page, request }) => {
    const user = await newUser(request);
    const account = await apiPost(request, user, '/accounts', { name: 'Carteira', type: 'CASH' });
    await apiPost(request, user, '/transaction-groups', {
      description: 'Mercado',
      recurrenceType: 'VARIABLE',
      totalAmount: '10.00',
      accountId: account.id,
      categoryId: await categoryId(request, user, 'Alimentação'),
      purchaseDate: '2026-11-08',
      firstDueDate: '2026-11-15',
    });
    await signIn(page, user.email);

    await openTab(page, 'Contas');
    await page.getByRole('button', { name: 'Excluir Carteira' }).click();

    await expect(page.getByRole('alert')).toContainText('Inative a conta');
  });

  test('cria, renomeia e exclui categoria; categoria em uso pede a reatribuição', async ({ page, request }) => {
    const user = await newUser(request);
    const account = await apiPost(request, user, '/accounts', { name: 'Carteira', type: 'CASH' });
    const food = await categoryId(request, user, 'Alimentação');
    await apiPost(request, user, '/transaction-groups', {
      description: 'Mercado',
      recurrenceType: 'VARIABLE',
      totalAmount: '10.00',
      accountId: account.id,
      categoryId: food,
      purchaseDate: '2026-11-08',
      firstDueDate: '2026-11-15',
    });
    await signIn(page, user.email);

    await openFromMore(page, 'Categorias');
    await expect(page.getByRole('heading', { name: 'Categorias' })).toBeVisible();

    await page.getByRole('button', { name: 'Nova categoria' }).click();
    await page.getByLabel('Nome').fill('Pets');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Pets', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Editar Pets' }).click();
    await page.getByLabel('Nome').fill('Pets e bichos');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Pets e bichos')).toBeVisible();

    await page.getByRole('button', { name: 'Excluir Pets e bichos' }).click();
    await expect(page.getByText('Pets e bichos')).toHaveCount(0);

    // categoria em uso: pede para onde mover os lançamentos
    await page.getByRole('button', { name: 'Excluir Alimentação' }).click();
    await expect(page.getByRole('alert')).toContainText('possui lançamentos');
    await expect(page.getByRole('button', { name: 'Mover e excluir' })).toBeDisabled();
  });
});
