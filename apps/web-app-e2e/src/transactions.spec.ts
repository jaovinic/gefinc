import { Page, expect, test } from '@playwright/test';
import { createAccount, register, todayIso, uniqueEmail, chooseAccount, chooseOption, fillDate } from './support';

async function newTransaction(
  page: Page,
  fields: { description: string; account: string; category: string; cents: string; recurrence?: string; due: string; installments?: string },
) {
  await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
  const form = page.locator('gef-group-form');
  if (fields.recurrence) {
    await chooseOption(page, form, 'Tipo', { FIXED: 'Fixo mensal', INSTALLMENT: 'Parcelado', VARIABLE: 'Avulso' }[fields.recurrence]);
  }
  await form.getByLabel('Descrição ou loja').fill(fields.description);
  await chooseAccount(page, form, fields.account);
  await chooseOption(page, form, 'Categoria', fields.category);
  await form.getByLabel('Valor').fill(fields.cents);
  if (fields.installments) {
    await form.getByLabel('Quantidade de parcelas').fill(fields.installments);
  }
  await fillDate(form.getByLabel('Data da compra'), fields.due);
  await fillDate(form.getByLabel(/vencimento/i), fields.due);
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
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('1 lançamento(s)');
    await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Mercado/ })).toHaveCount(1);

    await page.getByRole('row', { name: /Mercado/ }).getByRole('button', { name: 'Excluir' }).click();
    await confirm.getByRole('button', { name: 'Excluir "Mercado"' }).click();
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
    await page.getByRole('row', { name: /Internet/ }).getByRole('button', { name: 'Encerrar Internet' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('As ocorrências pendentes depois deste mês serão removidas');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Encerrar lançamento' }).click();
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
    await fillDate(form.getByLabel('Data da compra'), '2026-11-12');
    await expect(form.getByText('Vence em 17/12/2026 (definido pela fatura do cartão).')).toBeVisible();
    await expect(form.getByLabel(/vencimento/i)).toHaveCount(0);
  });

  test('vencimento digitado pela metade e depois oculto (cartão) não trava o envio', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú', 'CHECKING');
    await createAccount(page, 'Nubank', 'CREDIT_CARD', { closing: 10, due: 17 }, { bank: 'Itaú' });
    await page.getByRole('link', { name: 'Lançamentos' }).click();
    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    const form = page.locator('gef-group-form');
    await chooseAccount(page, form, 'Itaú');
    await form.getByLabel(/vencimento/i).fill('3101'); // data incompleta
    await chooseAccount(page, form, 'Nubank'); // o campo some do formulário

    await form.getByLabel('Descrição ou loja').fill('Compra no cartão');
    await chooseOption(page, form, 'Categoria', 'Compras');
    await form.getByLabel('Valor').fill('1000');
    const created = page.waitForResponse((r) => r.url().includes('/transaction-groups') && r.request().method() === 'POST');
    await form.getByRole('button', { name: 'Salvar' }).click();
    expect((await created).status()).toBe(201);
  });

  test('parcelado: carnê em 3 parcelas aparece mês a mês com o resto de centavos na última', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú', 'CHECKING');
    await page.getByRole('link', { name: 'Lançamentos' }).click();

    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    const form = page.locator('gef-group-form');
    await chooseOption(page, form, 'Tipo', 'Parcelado');
    await form.getByLabel('Descrição ou loja').fill('Notebook');
    await chooseAccount(page, form, 'Itaú');
    await chooseOption(page, form, 'Categoria', 'Compras');
    await form.getByLabel('Valor total').fill('10000'); // R$ 100,00
    await form.getByLabel('Quantidade de parcelas').fill('3');
    await fillDate(form.getByLabel('Data da compra'), todayIso());
    await fillDate(form.getByLabel(/vencimento/i), todayIso());
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

  test('parcelado no cartão pelo valor da parcela: 10 × R$ 100,00 mostra as faturas e envia o total', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Nubank', 'CREDIT_CARD', { closing: 10, due: 17 });
    await page.getByRole('link', { name: 'Lançamentos' }).click();

    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    const form = page.locator('gef-group-form');
    await chooseOption(page, form, 'Tipo', 'Parcelado');
    await form.getByLabel('Descrição ou loja').fill('Geladeira');
    await chooseAccount(page, form, 'Nubank');
    await chooseOption(page, form, 'Categoria', 'Compras');
    await form.getByRole('button', { name: 'Valor da parcela' }).click();
    await form.getByLabel('Valor da parcela').fill('10000'); // R$ 100,00 por parcela
    await form.getByLabel('Quantidade de parcelas').fill('10');
    await fillDate(form.getByLabel('Data da compra'), '2026-11-05');
    await expect(form.getByTestId('installment-summary')).toHaveText('10 × R$ 100,00 = R$ 1.000,00');
    const preview = form.getByLabel('Prévia das parcelas');
    await expect(preview).toContainText('nov/2026 · vence 17/11');
    await expect(preview).toContainText('ago/2027 · vence 17/08');
    await form.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('dialog', { name: 'Novo lançamento' })).toHaveCount(0);
  });
});
