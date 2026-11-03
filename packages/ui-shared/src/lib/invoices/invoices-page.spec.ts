import { HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { currentMonth, monthLabelBR, todayIso } from '@gefinc/utils';
import { API, CATEGORIES, clickButton, configureHttpTesting, fillDate, type } from '../../testing/testbed';
import { NoticeService } from '../api';
import { Viewport } from '../viewport/viewport';
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
  async function setup(inv: object = invoice(), compact?: boolean) {
    if (compact !== undefined) {
      TestBed.configureTestingModule({ providers: [{ provide: Viewport, useValue: { compact: signal(compact) } }] });
    }
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

  it('escolhe o cartão pelo seletor com ícone e nome, e a projeção mostra o selo do cartão', async () => {
    const { el } = await setup();
    const trigger = el.querySelector('gef-account-picker button[aria-haspopup]') as HTMLButtonElement;
    expect(trigger.textContent).toContain('Nubank');
    expect(trigger.querySelector('svg')).not.toBeNull();
    expect(el.querySelector('table[aria-label="Projeção de faturas"] gef-account-badge')?.textContent).toContain('Nubank');
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

  it('pagar parte confirma com um aviso que oferece Desfazer o pagamento', async () => {
    const { http, el, fixture } = await setup();
    const notices = TestBed.inject(NoticeService);
    clickButton(el, 'Pagar parte');
    fixture.detectChanges();
    type(el, '[role="dialog"] gef-money-input input', '30000');
    fixture.detectChanges();
    clickButton(el, 'Confirmar');
    const paidInvoice = invoice({ remaining: '700.00', payments: [{ id: 4, amount: '100.00', paidAt: `${month}-01` }, { id: 5, amount: '300.00', paidAt: todayIso() }] });
    http.expectOne({ method: 'POST', url: `${API}/accounts/2/invoices/${month}/payments` }).flush(paidInvoice);
    reload(http, paidInvoice);

    const [toast] = notices.toasts();
    expect(toast.message).toBe('Pagamento da fatura registrado.');
    notices.runUndo(toast.id);
    http.expectOne({ method: 'DELETE', url: `${API}/invoice-payments/5` }).flush(invoice());
    reload(http);
  });

  it('o status dos itens tem ícone além do texto e da cor', async () => {
    const { el } = await setup(invoice({ items: [item({ status: 'PAID' }), item({ id: 2, overdue: true }), item({ id: 3 })] }));
    const badges = Array.from(el.querySelectorAll('tbody span.rounded-full'));
    expect(badges.length).toBeGreaterThanOrEqual(3);
    expect(badges.every((b) => b.querySelector('svg') !== null)).toBe(true);
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

  it('pagar com a data apagada ou incompleta não envia e avisa dentro do painel, junto ao campo', async () => {
    const { http, el, fixture } = await setup();
    clickButton(el, 'Quitar fatura');
    fixture.detectChanges();
    type(el, '#paidAt', '0511');
    clickButton(el, 'Confirmar');
    fixture.detectChanges();

    http.expectNone({ method: 'POST', url: `${API}/accounts/2/invoices/${month}/payments/settle` });
    const dialog = el.querySelector('[role="dialog"]') as HTMLElement;
    const alert = dialog.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Informe uma data válida');
    expect(el.querySelector('#paidAt')?.getAttribute('aria-describedby')).toContain(alert.id);
    expect(el.querySelectorAll('[role="alert"]')).toHaveLength(1);

    fillDate(el, '#paidAt', '2026-11-05');
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')).toBeNull();
    clickButton(el, 'Confirmar');
    const post = http.expectOne({ method: 'POST', url: `${API}/accounts/2/invoices/${month}/payments/settle` });
    expect(post.request.body).toEqual({ paidAt: '2026-11-05' });
    post.flush(invoice({ remaining: '0.00' }));
    reload(http, invoice({ remaining: '0.00', items: [item({ status: 'PAID' })] }));
  });

  it('pagar parte sem valor avisa dentro do painel; o erro do servidor também fica no painel', async () => {
    const { http, el, fixture } = await setup(invoice(), true);
    clickButton(el, 'Pagar parte');
    fixture.detectChanges();
    clickButton(el, 'Confirmar');
    fixture.detectChanges();
    const sheet = el.querySelector('[role="dialog"].gef-sheet') as HTMLElement;
    expect(sheet.querySelector('[role="alert"]')?.textContent).toContain('Informe o valor do pagamento.');
    expect(el.querySelectorAll('[role="alert"]')).toHaveLength(1);

    type(el, '[role="dialog"] gef-money-input input', '999999');
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')).toBeNull();
    clickButton(el, 'Confirmar');
    http.expectOne({ method: 'POST', url: `${API}/accounts/2/invoices/${month}/payments` }).flush(
      { code: 'INVOICE_BALANCE_VIOLATION', detail: 'O pagamento não pode ser maior que o saldo restante da fatura (R$ 1000.00).' },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();
    expect(sheet.querySelector('[role="alert"]')?.textContent).toContain('saldo restante da fatura');
    expect(el.querySelectorAll('[role="alert"]')).toHaveLength(1);
  });

  it('desfazer um pagamento pede confirmação e só então chama a API e recarrega', async () => {
    const { http, el, fixture } = await setup(invoice({ remaining: '700.00', payments: [{ id: 5, amount: '300.00', paidAt: `${month}-10` }] }));
    clickButton(el, 'Desfazer');
    fixture.detectChanges();
    http.expectNone({ method: 'DELETE', url: `${API}/invoice-payments/5` });
    const dialog = el.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog.textContent).toContain(`Desfazer o pagamento de 10/${month.slice(5)}/${month.slice(0, 4)} (R$ 300,00)? Os itens que ele quitou voltam a pendentes.`);
    clickButton(el, 'Desfazer pagamento');
    http.expectOne({ method: 'DELETE', url: `${API}/invoice-payments/5` }).flush(invoice());
    reload(http);
  });

  it('cancelar a confirmação de desfazer não chama a API', async () => {
    const { http, el, fixture } = await setup(invoice({ remaining: '700.00', payments: [{ id: 5, amount: '300.00', paidAt: `${month}-10` }] }));
    clickButton(el, 'Desfazer');
    fixture.detectChanges();
    (el.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
    http.expectNone({ method: 'DELETE', url: `${API}/invoice-payments/5` });
  });

  it('erro ao desfazer fica dentro do diálogo', async () => {
    const { http, el, fixture } = await setup(invoice({ remaining: '700.00', payments: [{ id: 5, amount: '300.00', paidAt: `${month}-10` }] }));
    clickButton(el, 'Desfazer');
    fixture.detectChanges();
    clickButton(el, 'Desfazer pagamento');
    http.expectOne({ method: 'DELETE', url: `${API}/invoice-payments/5` }).flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="confirm-error"]')?.textContent).toContain('erro inesperado');
  });

  describe('no celular (layout compacto)', () => {
    it('mostra os itens em cartões, sem tabela, e a projeção por cartão', async () => {
      const { el } = await setup(invoice(), true);

      expect(el.querySelector('table')).toBeNull();
      const items = el.querySelectorAll('[data-testid="invoice-item"]');
      expect(items).toHaveLength(2);
      expect(items[0].textContent).toContain('Notebook');
      expect(items[0].textContent).toContain('R$ 600,00');
      const projectionCard = el.querySelector('[data-testid="projection-card"]') as HTMLElement;
      expect(projectionCard.textContent).toContain('Nubank');
      expect(projectionCard.textContent).toContain('Comprometido');
      expect(projectionCard.textContent).toContain('R$ 1.000,00');
    });

    it('pagar parte abre o painel inferior e envia o pagamento', async () => {
      const { http, el, fixture } = await setup(invoice(), true);

      clickButton(el, 'Pagar parte');
      fixture.detectChanges();
      const dialog = el.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog.classList).toContain('gef-sheet');
      expect(dialog.getAttribute('aria-label')).toBe('Pagamento da fatura');
      type(el, '[role="dialog"] gef-money-input input', '30000');
      fixture.detectChanges();
      clickButton(el, 'Confirmar');

      const post = http.expectOne({ method: 'POST', url: `${API}/accounts/2/invoices/${month}/payments` });
      expect(post.request.body).toEqual({ amount: '300.00', paidAt: todayIso() });
      post.flush(invoice({ remaining: '700.00', paidByInvoicePayments: '300.00' }));
      reload(http, invoice({ remaining: '700.00' }));
    });

    it('abrir um mês da projeção e desfazer pagamento têm rótulos acessíveis', async () => {
      const { el } = await setup(
        invoice({ payments: [{ id: 5, amount: '300.00', paidAt: `${month}-10` }], remaining: '700.00' }),
        true,
      );

      expect(el.querySelector(`button[aria-label="Abrir fatura de Nubank em ${monthLabelBR(month)}"]`)).not.toBeNull();
      const undo = el.querySelector('button[aria-label^="Desfazer pagamento"]') as HTMLButtonElement;
      expect(undo).not.toBeNull();
      expect(undo.className).toContain('gef-btn-sm');
    });
  });
});

describe('InvoicesPage - toque duplo', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('tocar duas vezes em Confirmar registra o pagamento da fatura uma única vez', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(InvoicesPage);
    fixture.detectChanges();
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    ctx.http.expectOne((r) => r.url === `${API}/accounts/2/invoices/${month}`).flush(invoice());
    ctx.http.expectOne((r) => r.url === `${API}/invoices/projection`).flush(projection);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    clickButton(el, 'Quitar fatura');
    fixture.detectChanges();
    const confirm = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Confirmar') as HTMLButtonElement;
    confirm.click();
    confirm.click();

    ctx.http.expectOne({ method: 'POST', url: `${API}/accounts/2/invoices/${month}/payments/settle` }).flush(invoice({ remaining: '0.00' }));
    ctx.http.expectOne((r) => r.url === `${API}/accounts/2/invoices/${month}`).flush(invoice({ remaining: '0.00' }));
    ctx.http.expectOne((r) => r.url === `${API}/invoices/projection`).flush(projection);
  });
});
