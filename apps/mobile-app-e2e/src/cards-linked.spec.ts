import { expect, test } from '@playwright/test';
import { apiPost, categoryId, newUser, openTab, signIn, todayIso, chooseOption } from './support';

test.describe('cartões vinculados a uma conta bancária no celular', () => {
  test('o cartão aparece com ícone, nome, conta e selo no lançamento rápido e na lista de contas', async ({ page, request }) => {
    const user = await newUser(request);
    const bank = await apiPost(request, user, '/accounts', { name: 'Inter empresa', type: 'CHECKING', holderType: 'PJ', icon: 'briefcase' });
    const card = await apiPost(request, user, '/accounts', {
      name: 'Nubank Roxinho', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, bankAccountId: bank.id, icon: 'card-gold',
    });
    // compra no dia 1º: cai na fatura que vence no próprio mês e aparece na lista do mês atual
    await apiPost(request, user, '/transaction-groups', {
      description: 'Mercado', recurrenceType: 'VARIABLE', totalAmount: '42.00', accountId: card.id,
      categoryId: await categoryId(request, user, 'Alimentação'), purchaseDate: `${todayIso().slice(0, 8)}01`,
    });
    await signIn(page, user.email);

    // lista de contas: cartão com conta vinculada e selo herdado
    await openTab(page, 'Contas');
    const accountCard = page.getByTestId('account-card').filter({ hasText: 'Nubank Roxinho' });
    await expect(accountCard).toContainText('Inter empresa');
    await expect(accountCard.locator('[data-holder]')).toHaveText('PJ');

    // lançamento rápido: a escolha mostra ícone, nome, conta e selo
    await page.goto('/');
    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await page.getByLabel('Conta ou cartão').click();
    const option = page.locator('[role="option"]').filter({ hasText: 'Nubank Roxinho' });
    await expect(option).toContainText('Inter empresa');
    await expect(option).toContainText('PJ');
    await expect(option.locator('svg').first()).toBeVisible();
    await option.click();
    await page.getByLabel('Valor').click();
    await page.keyboard.type('4200');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();

    // o lançamento aparece na lista com o ícone e o nome do cartão
    await openTab(page, 'Lançamentos');
    const transaction = page.getByTestId('transaction-card').filter({ hasText: 'Mercado' });
    await expect(transaction).toContainText('Nubank Roxinho');
    await expect(transaction.locator('gef-account-badge svg')).toBeVisible();
  });

  test('cartão novo exige a conta bancária e orienta quando não existe nenhuma', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    await openTab(page, 'Contas');
    await page.getByRole('button', { name: 'Nova conta' }).first().click();
    await chooseOption(page, page, 'Tipo', 'Cartão de crédito');
    await expect(page.getByText('Cadastre uma conta bancária antes de criar um cartão.')).toBeVisible();
    await page.getByRole('button', { name: 'Cadastrar conta bancária' }).click();
    await expect(page.getByLabel('Pessoa física')).toBeVisible();
  });
});
