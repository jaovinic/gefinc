import { Page, expect, test } from '@playwright/test';
import { apiPost, categoryId, newUser, openTab, signIn } from './support';

/** SC-005 e SC-011: painel, lançamentos e faturas em até 2 s com ~6.000 lançamentos, online e do cache. */
const LIMIT_MS = 2_000;

async function timed(page: Page, action: () => Promise<void>, ready: () => Promise<void>): Promise<number> {
  const start = Date.now();
  await action();
  await ready();
  return Date.now() - start;
}

test('painel, lançamentos e faturas abrem em até 2 s com 6.000 lançamentos, com e sem conexão', async ({ page, request, context }) => {
  test.setTimeout(180_000);
  const user = await newUser(request);
  const itau = await apiPost(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING' });
  const nubank = await apiPost(request, user, '/accounts', { name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17 });
  const food = await categoryId(request, user, 'Alimentação');
  // 120 compras de 50 parcelas = 6.000 lançamentos, metade no cartão, espalhados por mais de 4 anos
  for (let i = 0; i < 120; i++) {
    await apiPost(request, user, '/transaction-groups', {
      description: `Carga ${i}`, recurrenceType: 'INSTALLMENT', totalInstallments: 50, totalAmount: '500.00',
      accountId: i % 2 === 0 ? nubank.id : itau.id, categoryId: food, purchaseDate: '2024-01-05', firstDueDate: '2024-01-17',
    });
  }
  await signIn(page, user.email);
  const indicator = page.locator('[data-indicator="total-month"]');
  const firstCard = page.getByTestId('transaction-card').first();
  const invoiceTotal = page.locator('p:text-is("Total da fatura")');

  const online = {
    lancamentos: await timed(page, () => openTab(page, 'Lançamentos'), () => expect(firstCard).toBeVisible()),
    painel: await timed(page, () => openTab(page, 'Painel'), () => expect(indicator).toBeVisible()),
    faturas: await timed(page, () => openTab(page, 'Faturas'), () => expect(invoiceTotal).toBeVisible()),
  };
  console.log('online (ms):', JSON.stringify(online));
  for (const [name, ms] of Object.entries(online)) {
    expect(ms, `${name} online`).toBeLessThan(LIMIT_MS);
  }

  // sem conexão, a partir da cópia local
  await context.setOffline(true);
  const offline = {
    lancamentos: await timed(page, () => openTab(page, 'Lançamentos'), () => expect(firstCard).toBeVisible()),
    painel: await timed(page, () => openTab(page, 'Painel'), () => expect(indicator).toBeVisible()),
    faturas: await timed(page, () => openTab(page, 'Faturas'), () => expect(invoiceTotal).toBeVisible()),
  };
  console.log('offline (ms):', JSON.stringify(offline));
  for (const [name, ms] of Object.entries(offline)) {
    expect(ms, `${name} sem conexão`).toBeLessThan(LIMIT_MS);
  }
});
