import { expect, test } from '@playwright/test';
import { createAccount, register, todayIso, uniqueEmail, chooseAccount } from './support';

test('fatura do cartão com pagamento parcial e conferência dos totais do painel', async ({ page }) => {
  const today = todayIso();
  const firstOfMonth = `${today.slice(0, 7)}-01`; // dia 1 está antes do fechamento (dia 10): a fatura vence neste mês

  await register(page, uniqueEmail());
  await createAccount(page, 'Itaú', 'CHECKING');
  await createAccount(page, 'Nubank', 'CREDIT_CARD', { closing: 10, due: 17 });
  await page.getByRole('link', { name: 'Lançamentos' }).click();

  const form = page.locator('gef-group-form');
  async function add(description: string, account: string, category: string, cents: string, purchase: string, due?: string) {
    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    await form.getByLabel('Descrição ou loja').fill(description);
    await chooseAccount(page, form, account);
    await form.getByLabel('Categoria').selectOption({ label: category });
    await form.getByLabel('Valor').fill(cents);
    await form.getByLabel('Data da compra').fill(purchase);
    if (due) {
      await form.getByLabel(/vencimento/i).fill(due);
    }
    await form.getByRole('button', { name: 'Salvar' }).click();
    await expect(form).toHaveCount(0);
  }

  await add('Mercado', 'Itaú', 'Alimentação', '15000', today, today); // R$ 150,00 pendente
  await add('Cinema', 'Itaú', 'Lazer', '9000', today, today); // R$ 90,00, será pago
  await add('Mouse', 'Nubank', 'Compras', '10000', firstOfMonth); // R$ 100,00 na fatura do mês

  await page.getByRole('row', { name: /Cinema/ }).getByRole('button', { name: 'Pagar' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('row', { name: /Cinema/ })).toContainText('Pago');

  // fatura do cartão: pagamento parcial de R$ 30,00
  await page.getByRole('link', { name: 'Faturas' }).click();
  await expect(page.getByText('R$ 100,00').first()).toBeVisible();
  await page.getByRole('button', { name: 'Pagar parte' }).click();
  await page.getByRole('dialog').getByLabel('Valor do pagamento').fill('3000');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Pagamentos da fatura')).toBeVisible();
  await expect(page.getByText('R$ 70,00').first()).toBeVisible(); // restante

  // painel: 150 + 90 + 100 = 340 no mês; pago = Cinema 90 + 30 da fatura
  await page.getByRole('link', { name: 'Painel', exact: true }).click();
  await expect(page.locator('[data-indicator="total-month"]')).toContainText('R$ 340,00');
  await expect(page.locator('[data-indicator="paid"]')).toContainText('R$ 120,00');
  await expect(page.locator('canvas[role="img"]')).toHaveCount(2);
  await expect(page.getByLabel('Legenda do gráfico por cartão')).toContainText('Nubank');
  await expect(page.getByLabel('Legenda do gráfico por categoria')).toContainText('Alimentação');
});
