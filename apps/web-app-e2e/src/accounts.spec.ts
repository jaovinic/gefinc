import { expect, test } from '@playwright/test';
import { createAccount, register, uniqueEmail } from './support';

test.describe('contas e cartões', () => {
  test('cadastra conta bancária, cartão vinculado e dinheiro; edita, inativa, reativa e exclui', async ({ page }) => {
    await register(page, uniqueEmail());
    await page.getByRole('link', { name: 'Contas e cartões', exact: true }).click();
    await expect(page.getByText('Nenhuma conta cadastrada')).toBeVisible();

    // sem conta bancária o cartão orienta e oferece o atalho
    await page.getByRole('button', { name: 'Nova conta' }).first().click();
    await page.getByLabel('Tipo').selectOption('CREDIT_CARD');
    await expect(page.getByText('Cadastre uma conta bancária antes de criar um cartão.')).toBeVisible();
    await page.getByRole('button', { name: 'Cadastrar conta bancária' }).click();
    await page.getByLabel('Nome').fill('Itaú');
    await page.getByRole('button', { name: 'Salvar' }).click();
    // titular é obrigatório na conta bancária
    await expect(page.getByText('Escolha pessoa física ou jurídica.')).toBeVisible();
    await page.getByLabel('Pessoa física').check();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('row', { name: /Itaú/ })).toContainText('PF');

    await page.getByRole('button', { name: 'Nova conta' }).first().click();
    await page.getByLabel('Tipo').selectOption('CREDIT_CARD');
    await page.getByLabel('Nome').fill('Nubank');
    // cartão sem conta e sem os dias é recusado na própria tela
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Escolha a conta bancária do cartão.').first()).toBeVisible();
    await expect(page.getByText('Informe um dia entre 1 e 31.').first()).toBeVisible();
    await page.getByLabel('Conta bancária').click();
    await page.locator('[role="option"]').filter({ hasText: 'Itaú' }).click();
    await page.getByLabel('Dia de fechamento da fatura').fill('10');
    await page.getByLabel('Dia de vencimento da fatura').fill('17');
    await page.getByRole('button', { name: 'Salvar' }).click();

    const nubank = page.getByRole('row', { name: /Nubank/ });
    await expect(nubank).toContainText('Cartão de crédito');
    await expect(nubank).toContainText('Itaú');
    await expect(nubank).toContainText('dia 10');
    await expect(nubank).toContainText('dia 17');

    await createAccount(page, 'Carteira', 'CASH');
    await expect(page.getByRole('row', { name: /Carteira/ })).toContainText('Dinheiro');

    // edita o dia de vencimento do cartão
    await page.getByRole('row', { name: /Nubank/ }).getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Dia de vencimento da fatura').fill('20');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('row', { name: /Nubank/ })).toContainText('dia 20');

    // inativa a carteira: some da lista até marcar "Mostrar inativas"
    await page.getByRole('row', { name: /Carteira/ }).getByRole('button', { name: 'Inativar' }).click();
    await expect(page.getByRole('row', { name: /Carteira/ })).toHaveCount(0);
    await page.getByLabel('Mostrar inativas').check();
    await expect(page.getByRole('row', { name: /Carteira/ })).toContainText('Inativa');
    await page.getByRole('row', { name: /Carteira/ }).getByRole('button', { name: 'Reativar' }).click();
    await expect(page.getByRole('row', { name: /Carteira/ })).toContainText('Ativa');

    // exclui a carteira (sem lançamentos)
    await page.getByRole('row', { name: /Carteira/ }).getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByRole('row', { name: /Carteira/ })).toHaveCount(0);
  });
});
