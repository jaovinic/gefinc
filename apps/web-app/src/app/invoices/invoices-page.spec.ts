import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { currentMonth, todayIso } from '@gefinc/utils';
import { API, CATEGORIES, clickButton, configureHttpTesting, type } from '../../test/testbed';
import { InvoicesPage } from './invoices-page';

const month = currentMonth();
const item = (over: object) => ({
  id: 1, groupId: 9, accountId: 2, categoryId: 10, description: 'Notebook', recurrenceType: 'VARIABLE',
  installmentNumber: 1, totalInstallments: 1, amount: '600.00', dueDate: `${month}-17`, status: 'PENDING',
  overdue: false, settledByInvoicePayment: false, version: 0, ...over,
});
const invoice = (over: object = {}) => ({
  accountId: 2, month, dueDate: `${month}-17`, total: '1000.00', paidIndividually: '0.00',
  paidByInvoicePayments: '0.00', remaining: '1000.00',
  items: [item({}), item({ id: 2, description: 'Tênis', amount: '400.00' })], payments: [], ...over,
});
const projection = {
  months: [month],
  cards: [{ accountId: 2, name: 'Nubank', totalCommitted: '1000.00', invoices: [{ month, total: '1000.00', remaining: '1000.00' }] }],
};

describe('InvoicesPage', () => {
  async function setup(inv: object = invoice()) {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(InvoicesPage);
    fixture.detectChanges();
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    ctx.http.expectOne((r) => r.url === `${API}/accounts/2/invoices/${month}`).flush(inv);
    ctx.http.expectOne((r) => r.url === `${API}/invoices/projection`).flush(projection);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  const reload = (http: HttpTestingController, inv: object = invoice()) => {
    http.expectOne((r) => r.url === `${API}/accounts/2/invoices/${month}`).flush(inv);
    http.expectOne((r) => r.url === `${API}/invoices/projection`).flush(projection);
  };

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('sem cartão cadastrado orienta a cadastrar um', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(InvoicesPage);
    fixture.detectChanges();
    ctx.http.expectOne((r) => r.url === `${API}/accounts`).flush([{ id: 1, name: 'Itaú', type: 'CHECKING', active: true, version: 0 }]);
    ctx.http.expectOne((r) => r.url === `${API}/categories`).flush(CATEGORIES);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nenhum cartão cadastrado');
  });

  it('mostra total, pago, restante, vencimento, itens e projeção', async () => {
    const { el } = await setup();
    expect(el.textContent).toContain('R$ 1.000,00');
    expect(el.textContent).toContain('Notebook');
    expect(el.textContent).toContain('Tênis');
    expect(el.querySelector('[aria-label="Projeção de faturas"]')?.textContent).toContain('Nubank');
  });

  it('pagar parte envia o valor e a data e recarrega a fatura', async () => {
    const { http, el, fixture } = await setup();
    clickButton(el, 'Pagar parte');
    fixture.detectChanges();
    type(el, '[role="dialog"] gef-money-input input', '30000');
    fixture.detectChanges();
    clickButton(el, 'Confirmar');

    const post = http.expectOne({ method: 'POST', url: `${API}/accounts/2/invoices/${month}/payments` });
    expect(post.request.body).toEqual({ amount: '300.00', paidAt: todayIso() });
    post.flush(invoice({ remaining: '700.00', paidByInvoicePayments: '300.00' }));
    reload(http, invoice({ remaining: '700.00', paidByInvoicePayments: '300.00', payments: [{ id: 5, amount: '300.00', paidAt: todayIso() }] }));
    fixture.detectChanges();
    expect(el.textContent).toContain('R$ 700,00');
    expect(el.textContent).toContain('Pagamentos da fatura');
  });

  it('quitar fatura usa o restante total', async () => {
    const { http, el, fixture } = await setup();
    clickButton(el, 'Quitar fatura');
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')?.textContent).toContain('R$ 1.000,00');
    clickButton(el, 'Confirmar');
    const post = http.expectOne({ method: 'POST', url: `${API}/accounts/2/invoices/${month}/payments/settle` });
    expect(post.request.body).toEqual({ paidAt: todayIso() });
    post.flush(invoice({ remaining: '0.00' }));
    reload(http, invoice({ remaining: '0.00', items: [item({ status: 'PAID' })] }));
  });

  it('pagamento acima do restante mostra a mensagem do servidor', async () => {
    const { http, el, fixture } = await setup();
    clickButton(el, 'Pagar parte');
    fixture.detectChanges();
    type(el, '[role="dialog"] gef-money-input input', '999999');
    clickButton(el, 'Confirmar');
    http.expectOne({ method: 'POST', url: `${API}/accounts/2/invoices/${month}/payments` }).flush(
      { code: 'INVOICE_BALANCE_VIOLATION', detail: 'O pagamento não pode ser maior que o saldo restante da fatura (R$ 1000.00).' },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('saldo restante da fatura');
  });

  it('desfazer um pagamento chama a API e recarrega', async () => {
    const { http, el } = await setup(invoice({ remaining: '700.00', payments: [{ id: 5, amount: '300.00', paidAt: `${month}-10` }] }));
    clickButton(el, 'Desfazer');
    http.expectOne({ method: 'DELETE', url: `${API}/invoice-payments/5` }).flush(invoice());
    reload(http);
  });
});
