import { Page, expect, test } from '@playwright/test';
import { apiPost, categoryId, newUser, openTab, signIn } from './support';

/** Valor mostrado no cartão de resumo da fatura (rótulo e valor são parágrafos vizinhos). */
const summary = (page: Page, label: string) => page.locator(`p:text-is("${label}") + p`);

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

test.describe('faturas no celular', () => {
  test('paga parte, recusa acima do restante, quita, desfaz o pagamento e abre a projeção', async ({ page, request }) => {
    const user = await newUser(request);
    // fecha dia 1 e vence dia 28: compras do dia 1 caem na fatura que vence no próprio mês
    const nubank = await apiPost(request, user, '/accounts', { name: 'Nubank', type: 'CREDIT_CARD', closingDay: 1, dueDay: 28 });
    const food = await categoryId(request, user, 'Alimentação');
    for (const [description, amount] of [['Notebook', '60.00'], ['Tênis', '40.00']]) {
      await apiPost(request, user, '/transaction-groups', {
        description, recurrenceType: 'VARIABLE', totalAmount: amount, accountId: nubank.id,
        categoryId: food, purchaseDate: `${currentMonth()}-01`,
      });
    }
    await signIn(page, user.email);

    await openTab(page, 'Faturas');
    await expect(page.getByRole('heading', { name: 'Faturas' })).toBeVisible();
    await expect(summary(page, 'Total da fatura')).toHaveText('R$ 100,00');
    await expect(page.getByTestId('invoice-item')).toHaveCount(2);

    // pagamento parcial de R$ 30
    await page.getByRole('button', { name: 'Pagar parte' }).click();
    const dialog = page.getByRole('dialog', { name: 'Pagamento da fatura' });
    await dialog.getByLabel('Valor do pagamento').fill('3000');
    await dialog.getByRole('button', { name: 'Confirmar' }).click();
    await expect(summary(page, 'Restante')).toHaveText('R$ 70,00');
    await expect(summary(page, 'Pago')).toHaveText('R$ 30,00');
    // os itens não mudam de status com pagamento parcial
    await expect(page.getByTestId('invoice-item').first()).toContainText('Pend');

    // acima do restante é recusado e o saldo não muda
    await page.getByRole('button', { name: 'Pagar parte' }).click();
    await page.getByRole('dialog', { name: 'Pagamento da fatura' }).getByLabel('Valor do pagamento').fill('8000');
    await page.getByRole('dialog', { name: 'Pagamento da fatura' }).getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('dialog', { name: 'Pagamento da fatura' }).getByRole('button', { name: 'Cancelar' }).click();
    await expect(summary(page, 'Restante')).toHaveText('R$ 70,00');

    // quita o restante: itens passam a pagos
    await page.getByRole('button', { name: 'Quitar fatura' }).click();
    await page.getByRole('dialog', { name: 'Pagamento da fatura' }).getByRole('button', { name: 'Confirmar' }).click();
    await expect(summary(page, 'Restante')).toHaveText('R$ 0,00');
    await expect(page.getByTestId('invoice-item').first()).toContainText('Pago');

    // desfaz o pagamento de quitação: volta para R$ 70,00 e itens pendentes
    await page.getByRole('button', { name: /^Desfazer pagamento de/ }).last().click();
    await expect(summary(page, 'Restante')).toHaveText('R$ 70,00');
    await expect(page.getByTestId('invoice-item').first()).toContainText('Pend');

    // projeção das próximas faturas
    const projection = page.getByTestId('projection-card');
    await expect(projection).toContainText('Nubank');
    await expect(projection).toContainText('Comprometido');
  });
});
