import { expect, test } from '@playwright/test';
import { createAccount, register, todayIso, uniqueEmail, chooseOption, fillDate } from './support';

test.describe('cartões vinculados a uma conta bancária', () => {
  test('lança no cartão e vê ícone, nome, conta e selo; troca o vínculo sem mudar valores; avisa ao inativar a conta', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú pessoal', 'CHECKING', undefined, { holder: 'PF' });
    await createAccount(page, 'Inter empresa', 'CHECKING', undefined, { holder: 'PJ' });
    await createAccount(page, 'Nubank Roxinho', 'CREDIT_CARD', { closing: 10, due: 17 }, { bank: 'Itaú pessoal' });

    // o cartão mostra a conta vinculada e o selo herdado na lista de contas
    const card = page.getByRole('row', { name: /Nubank Roxinho/ });
    await expect(card).toContainText('Itaú pessoal');
    await expect(card.locator('[data-holder]')).toHaveText('PF');

    // lança uma despesa no cartão: a escolha mostra ícone, nome, conta e selo
    await page.goto('/transactions');
    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    const form = page.locator('gef-group-form');
    await form.getByLabel('Conta ou cartão').click();
    const option = page.locator('[role="option"]').filter({ hasText: 'Nubank Roxinho' });
    await expect(option).toContainText('Itaú pessoal');
    await expect(option.locator('svg').first()).toBeVisible();
    await option.click();
    await form.getByLabel('Descrição ou loja').fill('Mercado');
    await chooseOption(page, form, 'Categoria', 'Alimentação');
    await form.getByLabel('Valor').fill('15000');
    await fillDate(form.getByLabel('Data da compra'), `${todayIso().slice(0, 8)}01`);
    await form.getByRole('button', { name: 'Salvar' }).click();
    const row = page.getByRole('row', { name: /Mercado/ });
    await expect(row).toContainText('Nubank Roxinho');
    await expect(row.locator('gef-account-badge svg')).toBeVisible();
    await expect(row).toContainText('R$ 150,00');

    // troca o vínculo para a conta PJ: valor do lançamento não muda e o selo passa a PJ
    await page.goto('/accounts');
    await page.getByRole('row', { name: /Nubank Roxinho/ }).getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Conta bancária').click();
    await page.locator('[role="option"]').filter({ hasText: 'Inter empresa' }).click();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('row', { name: /Nubank Roxinho/ }).locator('[data-holder]')).toHaveText('PJ');
    await page.goto('/transactions');
    await expect(page.getByRole('row', { name: /Mercado/ })).toContainText('R$ 150,00');

    // inativar a conta com cartão vinculado avisa quais cartões
    await page.goto('/accounts');
    const bankRow = page.getByRole('row').filter({ has: page.locator('[data-name]', { hasText: /^Inter empresa$/ }) });
    await bankRow.getByRole('button', { name: 'Inativar' }).click();
    await expect(page.getByRole('dialog')).toContainText('Nubank Roxinho');
    await page.getByRole('button', { name: 'Voltar' }).click();
    await expect(bankRow).toContainText('Ativa');
  });
});
