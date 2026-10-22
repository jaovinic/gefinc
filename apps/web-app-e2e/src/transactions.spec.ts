import { Page, expect, test } from '@playwright/test';
import { createAccount, register, todayIso, uniqueEmail, chooseAccount } from './support';

async function newTransaction(
  page: Page,
  fields: { description: string; account: string; category: string; cents: string; recurrence?: string; due: string; installments?: string },
) {
  await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
  const form = page.locator('gef-group-form');
  if (fields.recurrence) {
    await form.getByLabel('Tipo').selectOption(fields.recurrence);
  }
  await form.getByLabel('Descrição ou loja').fill(fields.description);
  await chooseAccount(page, form, fields.account);
  await form.getByLabel('Categoria').selectOption({ label: fields.category });
  await form.getByLabel('Valor').fill(fields.cents);
  if (fields.installments) {
    await form.getByLabel('Quantidade de parcelas').fill(fields.installments);
  }
  await form.getByLabel('Data da compra').fill(fields.due);
  await form.getByLabel(/vencimento/i).fill(fields.due);
  await form.getByRole('button', { name: 'Salvar' }).click();
}

test.describe('receitas e despesas', () => {
  test('avulso: cadastra, paga, desfaz o pagamento e exclui', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú', 'CHECKING');
    await page.getByRole('link', { name: 'Lançamentos' }).click();
    await expect(page.getByText('Nenhum lançamento neste mês')).toBeVisible();

    await newTransaction(page, { description: 'Mercado', account: 'Itaú', category: 'Alimentação', cents: '15000', due: todayIso() });
    const row = page.getByRole('row', { name: /Mercado/ });
    await expect(row).toContainText('R$ 150,00');
    await expect(row).toContainText('Pend');

    await row.getByRole('button', { name: 'Pagar' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByRole('row', { name: /Mercado/ })).toContainText('Pago');

    await page.getByRole('row', { name: /Mercado/ }).getByRole('button', { name: 'Desfazer' }).click();
    await expect(page.getByRole('row', { name: /Mercado/ })).toContainText('Pend');

    await page.getByRole('row', { name: /Mercado/ }).getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByRole('dialog')).toContainText('1 lançamento(s)');
    await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByText('Nenhum lançamento neste mês')).toBeVisible();
  });

  test('fixo: repete nos meses seguintes e pode ser encerrado', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú', 'CHECKING');
    await page.getByRole('link', { name: 'Lançamentos' }).click();

    await newTransaction(page, { description: 'Internet', account: 'Itaú', category: 'Serviços', cents: '9990', recurrence: 'FIXED', due: todayIso() });
    await expect(page.getByRole('row', { name: /Internet/ })).toContainText('Fixo');

    await page.getByRole('button', { name: 'Próximo mês' }).click();
    await expect(page.getByRole('row', { name: /Internet/ })).toContainText('R$ 99,90');

    // encerra no mês corrente: o mês seguinte fica sem a ocorrência
    await page.getByRole('button', { name: 'Mês anterior' }).click();
    await page.getByRole('row', { name: /Internet/ }).getByRole('button', { name: 'Encerrar aqui' }).click();
    await page.getByRole('button', { name: 'Próximo mês' }).click();
    await expect(page.getByText('Nenhum lançamento neste mês')).toBeVisible();
  });

  test('cartão: o vencimento é definido pela fatura', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Nubank', 'CREDIT_CARD', { closing: 10, due: 17 });
    await page.getByRole('link', { name: 'Lançamentos' }).click();
    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    const form = page.locator('gef-group-form');
    await chooseAccount(page, form, 'Nubank');
    await form.getByLabel('Data da compra').fill('2026-11-12');
    await expect(form.getByText('Vence em 17/12/2026 (definido pela fatura do cartão).')).toBeVisible();
    await expect(form.getByLabel(/vencimento/i)).toHaveCount(0);
  });

  test('parcelado: carnê em 3 parcelas aparece mês a mês com o resto de centavos na última', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú', 'CHECKING');
    await page.getByRole('link', { name: 'Lançamentos' }).click();

    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    const form = page.locator('gef-group-form');
    await form.getByLabel('Tipo').selectOption('INSTALLMENT');
    await form.getByLabel('Descrição ou loja').fill('Notebook');
    await chooseAccount(page, form, 'Itaú');
    await form.getByLabel('Categoria').selectOption({ label: 'Compras' });
    await form.getByLabel('Valor total').fill('10000'); // R$ 100,00
    await form.getByLabel('Quantidade de parcelas').fill('3');
    await form.getByLabel('Data da compra').fill(todayIso());
    await form.getByLabel(/vencimento/i).fill(todayIso());
    const preview = form.getByLabel('Prévia das parcelas');
    await expect(preview).toContainText('R$ 33,33');
    await expect(preview).toContainText('R$ 33,34');
    await form.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByRole('row', { name: /Notebook/ })).toContainText('1/3');
    await page.getByRole('button', { name: 'Próximo mês' }).click();
    await expect(page.getByRole('row', { name: /Notebook/ })).toContainText('2/3');
    await page.getByRole('button', { name: 'Próximo mês' }).click();
    await expect(page.getByRole('row', { name: /Notebook/ })).toContainText('3/3');
    await expect(page.getByRole('row', { name: /Notebook/ })).toContainText('R$ 33,34');
  });
});
