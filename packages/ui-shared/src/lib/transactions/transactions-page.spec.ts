import { HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { currentMonth, todayIso } from '@gefinc/utils';
import { API, clickButton, configureHttpTesting, fillDate, optionLabels, pickOption, type } from '../../testing/testbed';
import { NoticeService } from '../api';
import { OFFLINE_WRITES, PENDING_CHANGE, PENDING_MARKER } from './pending-marker';
import { Viewport } from '../viewport/viewport';
import { TransactionsPage } from './transactions-page';

const pending = {
  id: 1, groupId: 100, accountId: 1, categoryId: 10, description: 'Mercado', recurrenceType: 'VARIABLE',
  installmentNumber: 1, totalInstallments: 1, amount: '150.00', dueDate: '2026-11-15', status: 'PENDING', overdue: false, version: 0,
};
const late = { ...pending, id: 2, groupId: 101, description: 'Luz', amount: '90.50', dueDate: '2026-11-05', overdue: true };
const paid = { ...pending, id: 3, groupId: 102, description: 'Cinema', categoryId: 11, status: 'PAID', paymentDate: '2026-11-08', dueDate: '2026-11-08' };
const fixedIncome = { ...pending, id: 4, groupId: 103, description: 'Salário', categoryId: 20, recurrenceType: 'FIXED', amount: '5000.00', dueDate: '2026-11-05' };
/** Data relativa a hoje: a regra de receita depende de a data já ter chegado ou não. */
const dayIso = (offset: number) => todayIso(new Date(Date.now() + offset * 86_400_000));
const futureIncome = { ...pending, id: 5, groupId: 104, description: 'Freela', categoryId: 20, amount: '800.00', dueDate: dayIso(10) };
const receivedIncome = { ...futureIncome, id: 6, groupId: 105, description: 'Bônus', status: 'PAID', dueDate: dayIso(-2), paymentDate: dayIso(-2) };
const anticipatedIncome = { ...futureIncome, id: 7, groupId: 106, description: 'Adiantamento', status: 'PAID', paymentDate: dayIso(0) };

function page(content: unknown[]) {
  return { content, page: 0, size: 25, totalElements: content.length };
}

describe('TransactionsPage', () => {
  async function setup(
    content: unknown[] = [pending, late, paid, fixedIncome],
    options: { compact?: boolean; query?: Record<string, string> } = {},
  ) {
    const extra: unknown[] = [];
    if (options.compact !== undefined) {
      extra.push({ provide: Viewport, useValue: { compact: signal(options.compact) } });
    }
    if (options.query) {
      extra.push({ provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(options.query) } } });
    }
    if (extra.length > 0) {
      TestBed.configureTestingModule({ providers: extra as never[] });
    }
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(TransactionsPage);
    fixture.detectChanges();
    ctx.http.expectOne((r) => r.url === `${API}/transactions`).flush(page(content));
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  const listRequest = (http: HttpTestingController) =>
    http.expectOne((r) => r.method === 'GET' && r.url === `${API}/transactions`);

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('cada lançamento mostra o ícone e o nome da conta ou do cartão', async () => {
    const { el, http } = await setup([pending, { ...pending, id: 9, groupId: 109, description: 'Fone', accountId: 2 }]);
    const badges = Array.from(el.querySelectorAll('tbody gef-account-badge'));
    expect(badges).toHaveLength(2);
    expect(badges[0].textContent).toContain('Itaú');
    expect(badges[1].textContent).toContain('Nubank');
    expect(badges.every((b) => b.querySelector('svg') !== null)).toBe(true);
    http.verify();
  });

  it('despesa aparece em vermelho e receita em verde', async () => {
    const { el, http } = await setup();
    expect(el.querySelector('tbody td[data-kind="expense"]')?.className).toContain('text-gefinc-danger');
    expect(el.querySelector('tbody td[data-kind="income"]')?.className).toContain('text-gefinc-primary');
    http.verify();
  });

  it('receita usa Receber e A receber, e despesa continua com Pagar e Pend', async () => {
    const { el, http } = await setup([pending, late, paid, { ...fixedIncome, dueDate: dayIso(5) }]);
    const rowOf = (text: string) => Array.from(el.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes(text)) as HTMLElement;
    const salary = rowOf('Salário');
    expect(salary.textContent).toContain('A receber');
    expect(Array.from(salary.querySelectorAll('button')).map((b) => b.textContent?.trim())).toContain('Antecipar recebimento');
    expect(Array.from(salary.querySelectorAll('button')).map((b) => b.textContent?.trim())).not.toContain('Pagar');
    const market = rowOf('Mercado');
    expect(market.textContent).toContain('Pend');
    expect(Array.from(market.querySelectorAll('button')).map((b) => b.textContent?.trim())).toContain('Pagar');
    http.verify();
  });

  it('lista os lançamentos do mês corrente com valor em reais, categoria, conta e status', async () => {
    const { http, el } = await setup();
    expect(el.textContent).toContain('Mercado');
    expect(el.textContent).toContain('R$ 150,00');
    expect(el.textContent).toContain('R$ 90,50');
    expect(el.textContent).toContain('15/11/2026');
    expect(el.textContent).toContain('Alimentação');
    expect(el.textContent).toContain('Itaú');
    expect(el.textContent).toContain('Pend');
    expect(el.textContent).toContain('Vencido');
    expect(el.textContent).toContain('Pago');
    expect(el.textContent).toContain('Fixo');
    expect(el.textContent).toContain('4 lançamento(s)');
    http.verify();
  });

  it('pedia apenas o mês corrente na primeira carga', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(TransactionsPage);
    fixture.detectChanges();
    const request = ctx.http.expectOne((r) => r.url === `${API}/transactions`);
    expect(request.request.params.get('month')).toBe(currentMonth());
    expect(request.request.params.get('size')).toBe('25');
    request.flush(page([]));
    ctx.flushReference();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nenhum lançamento neste mês');
  });

  it('pagar abre o painel com a data de hoje e confirma o pagamento', async () => {
    const { http, el, fixture } = await setup();
    const row = Array.from(el.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes('Mercado')) as HTMLElement;
    (Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Pagar') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')?.textContent).toContain('Registrar o pagamento de');

    clickButton(el, 'Confirmar');
    const pay = http.expectOne({ method: 'POST', url: `${API}/transactions/1/pay` });
    expect(pay.request.body).toEqual({ paymentDate: todayIso() });
    pay.flush({ ...pending, status: 'PAID', paymentDate: todayIso() });
    listRequest(http).flush(page([]));
  });

  it('pagar com a data incompleta não envia e avisa; a data digitada vale no pagamento', async () => {
    const { http, el, fixture } = await setup();
    const row = Array.from(el.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes('Mercado')) as HTMLElement;
    (Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Pagar') as HTMLButtonElement).click();
    fixture.detectChanges();

    type(el, '#paymentDate', '0511');
    fixture.detectChanges();
    clickButton(el, 'Confirmar');
    fixture.detectChanges();
    http.expectNone({ method: 'POST', url: `${API}/transactions/1/pay` });
    // o aviso fica dentro do painel, junto ao campo (o da página ficaria atrás do fundo), e o campo o referencia
    const alert = el.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Informe uma data válida');
    expect(el.querySelector('[role="dialog"]')?.contains(alert)).toBe(true);
    expect(el.querySelector('#paymentDate')?.getAttribute('aria-describedby')).toContain(alert.id);

    fillDate(el, '#paymentDate', '2026-11-05');
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')).toBeNull();
    fixture.detectChanges();
    clickButton(el, 'Confirmar');
    const pay = http.expectOne({ method: 'POST', url: `${API}/transactions/1/pay` });
    expect(pay.request.body).toEqual({ paymentDate: '2026-11-05' });
    pay.flush({ ...pending, status: 'PAID', paymentDate: '2026-11-05' });
    listRequest(http).flush(page([]));
  });

  it('editar com o vencimento apagado não envia e avisa dentro do painel', async () => {
    const { http, el, fixture } = await setup();
    (el.querySelector('button[aria-label="Editar Mercado"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    type(el, '#editDue', '');
    clickButton(el, 'Salvar');
    fixture.detectChanges();
    http.expectNone({ method: 'PATCH', url: `${API}/transactions/1` });
    const alert = el.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Informe uma data válida');
    expect(el.querySelector('[role="dialog"]')?.contains(alert)).toBe(true);
  });

  it('erro do servidor ao pagar também aparece dentro do painel aberto', async () => {
    const { http, el, fixture } = await setup();
    (el.querySelector('button[aria-label="Pagar Mercado"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    clickButton(el, 'Confirmar');
    http.expectOne({ method: 'POST', url: `${API}/transactions/1/pay` }).flush({ title: 'Conflito', detail: 'Lançamento já foi pago.' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    const alert = el.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Lançamento já foi pago.');
    expect(el.querySelector('[role="dialog"]')?.contains(alert)).toBe(true);
  });

  it('receita aparece com + e despesa com −, com seta e sem depender só da cor', async () => {
    const { el, http } = await setup();
    const expense = el.querySelector('tbody td[data-kind="expense"]') as HTMLElement;
    const income = el.querySelector('tbody td[data-kind="income"]') as HTMLElement;
    expect(expense.textContent).toContain('\u2212 R$ 150,00');
    expect(income.textContent).toContain('+ R$ 5.000,00');
    expect(expense.querySelector('svg')).not.toBeNull();
    expect(income.querySelector('svg')).not.toBeNull();
    http.verify();
  });

  it('o status tem ícone além do texto e da cor (pago, vencido, pendente)', async () => {
    const { el, http } = await setup();
    const badges = Array.from(el.querySelectorAll('tbody td span.rounded-full'));
    const byText = (text: string) => badges.find((b) => b.textContent?.includes(text))!;
    for (const label of ['Pago', 'Vencido', 'Pend']) {
      expect(byText(label).querySelector('svg')).not.toBeNull();
    }
    http.verify();
  });

  it('pagar mostra uma confirmação com Desfazer, que desfaz o pagamento', async () => {
    const { http, el, fixture } = await setup();
    const notices = TestBed.inject(NoticeService);
    const row = Array.from(el.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes('Mercado')) as HTMLElement;
    (Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Pagar') as HTMLButtonElement).click();
    fixture.detectChanges();
    clickButton(el, 'Confirmar');
    http.expectOne({ method: 'POST', url: `${API}/transactions/1/pay` }).flush({ ...pending, status: 'PAID' });
    listRequest(http).flush(page([]));

    const [toast] = notices.toasts();
    expect(toast.message).toBe('Pagamento registrado.');
    notices.runUndo(toast.id);
    http.expectOne({ method: 'POST', url: `${API}/transactions/1/unpay` }).flush({ ...pending });
    listRequest(http).flush(page([]));
    expect(notices.toasts()).toEqual([]);
  });

  it('desfazer o pagamento recarrega a lista', async () => {
    const { http, el } = await setup();
    clickButton(el, 'Desfazer');
    http.expectOne({ method: 'POST', url: `${API}/transactions/3/unpay` }).flush({ ...paid, status: 'PENDING' });
    listRequest(http).flush(page([]));
  });

  it('mudar o filtro de status volta à primeira página e consulta de novo', async () => {
    const { http, el, fixture } = await setup();
    pickOption(fixture, 'Status', 'Pagos');
    fixture.detectChanges();
    const request = listRequest(http);
    expect(request.request.params.get('status')).toBe('PAID');
    expect(request.request.params.get('page')).toBe('0');
    request.flush(page([paid]));
  });

  it('o filtro de status diz A receber e Recebidas só quando o tipo é Receita', async () => {
    const { http, el, fixture } = await setup();
    const statusLabels = () => optionLabels(fixture, 'Status');
    expect(statusLabels()).toEqual(['Todos os status', 'Pendentes', 'Pagos']);

    pickOption(fixture, 'Natureza', 'Receitas');
    fixture.detectChanges();
    listRequest(http).flush(page([]));
    fixture.detectChanges();
    expect(statusLabels()).toEqual(['Todos os status', 'A receber', 'Recebidas']);

    pickOption(fixture, 'Natureza', 'Despesas');
    fixture.detectChanges();
    listRequest(http).flush(page([]));
    fixture.detectChanges();
    expect(statusLabels()).toEqual(['Todos os status', 'Pendentes', 'Pagos']);

    pickOption(fixture, 'Natureza', 'Receitas e despesas');
    fixture.detectChanges();
    listRequest(http).flush(page([]));
    fixture.detectChanges();
    expect(statusLabels()).toEqual(['Todos os status', 'Pendentes', 'Pagos']);
  });

  it('excluir mostra o impacto e só então confirma a exclusão do grupo', async () => {
    const { http, el, fixture } = await setup();
    const row = Array.from(el.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes('Mercado')) as HTMLElement;
    (Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Excluir') as HTMLButtonElement).click();
    http
      .expectOne({ method: 'GET', url: `${API}/transaction-groups/100/impact` })
      .flush({ paidCount: 2, pendingCount: 3, paidAmount: '20.00', pendingAmount: '30.00' });
    fixture.detectChanges();

    expect(el.querySelector('[role="alertdialog"]')?.textContent).toContain('3 lançamento(s)');
    expect(el.querySelector('[role="alertdialog"]')?.textContent).toContain('2 já pago(s) serão preservados');
    http.expectNone((r) => r.method === 'DELETE');
    clickButton(el, 'Excluir "Mercado"');
    const del = http.expectOne((r) => r.method === 'DELETE' && r.url === `${API}/transaction-groups/100`);
    expect(del.request.params.get('confirm')).toBe('true');
    del.flush(null, { status: 204, statusText: 'No Content' });
    listRequest(http).flush(page([]));
  });

  it('Cancelar e Escape no diálogo de exclusão não excluem nada', async () => {
    const { http, el, fixture } = await setup();
    const row = Array.from(el.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes('Mercado')) as HTMLElement;
    (Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Excluir') as HTMLButtonElement).click();
    http
      .expectOne({ method: 'GET', url: `${API}/transaction-groups/100/impact` })
      .flush({ paidCount: 2, pendingCount: 3, paidAmount: '20.00', pendingAmount: '30.00' });
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('[data-testid="confirm-cancel"]'));
    (el.querySelector('[role="alertdialog"]') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
    http.expectNone((r) => r.method === 'DELETE');
  });

  it('erro ao excluir fica dentro do diálogo, que continua aberto', async () => {
    const { http, el, fixture } = await setup();
    const row = Array.from(el.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes('Mercado')) as HTMLElement;
    (Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Excluir') as HTMLButtonElement).click();
    http
      .expectOne({ method: 'GET', url: `${API}/transaction-groups/100/impact` })
      .flush({ paidCount: 2, pendingCount: 3, paidAmount: '20.00', pendingAmount: '30.00' });
    fixture.detectChanges();
    clickButton(el, 'Excluir "Mercado"');
    http.expectOne((r) => r.method === 'DELETE').flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="confirm-error"]')?.textContent).toContain('erro inesperado');
    expect(el.querySelector('[role="alertdialog"]')).not.toBeNull();
  });

  const rowOf = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes(text)) as HTMLElement;
  const labels = (row: HTMLElement) => Array.from(row.querySelectorAll('button')).map((b) => b.textContent?.trim());

  it('receita recebida de data passada mostra Recebido e só Editar e Excluir', async () => {
    const { el, http } = await setup([receivedIncome]);
    const row = rowOf(el, 'Bônus');
    expect(row.textContent).toContain('Recebido');
    expect(labels(row)).toEqual(['Editar', 'Excluir']);
    http.verify();
  });

  it('receita futura pendente mostra A receber, Antecipar recebimento, Editar e Excluir, e nunca Atrasado', async () => {
    const { el, http } = await setup([{ ...futureIncome, overdue: true }]);
    const row = rowOf(el, 'Freela');
    expect(row.textContent).toContain('A receber');
    expect(row.textContent).not.toContain('Atrasado');
    expect(row.textContent).not.toContain('Vencido');
    expect(labels(row)).toEqual(['Antecipar recebimento', 'Editar', 'Excluir']);
    http.verify();
  });

  it('receita antecipada (recebida com data futura) oferece Desfazer', async () => {
    const { el, http } = await setup([anticipatedIncome]);
    const row = rowOf(el, 'Adiantamento');
    expect(row.textContent).toContain('Recebido');
    expect(labels(row)).toEqual(['Editar', 'Desfazer', 'Excluir']);
    http.verify();
  });

  it('receita legada em cartão segue a regra de despesa: pendente tem Receber, Editar e Excluir, mesmo com data futura', async () => {
    const { el, http } = await setup([{ ...futureIncome, accountId: 2 }]);
    expect(labels(rowOf(el, 'Freela'))).toEqual(['Receber', 'Editar', 'Excluir']);
    http.verify();
  });

  it('receita legada em cartão já recebida não é editável e oferece Desfazer, como despesa', async () => {
    const { el, http } = await setup([{ ...receivedIncome, accountId: 2 }]);
    expect(labels(rowOf(el, 'Bônus'))).toEqual(['Desfazer', 'Excluir']);
    http.verify();
  });

  it('despesa paga continua só com Desfazer e Excluir', async () => {
    const { el, http } = await setup([paid]);
    expect(labels(rowOf(el, 'Cinema'))).toEqual(['Desfazer', 'Excluir']);
    http.verify();
  });

  it('antecipar o recebimento explica o efeito e registra o pagamento da receita futura', async () => {
    const { http, el, fixture } = await setup([futureIncome]);
    (Array.from(rowOf(el, 'Freela').querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Antecipar recebimento') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')?.textContent).toContain('Antecipar o recebimento de');

    clickButton(el, 'Confirmar');
    const pay = http.expectOne({ method: 'POST', url: `${API}/transactions/5/pay` });
    expect(pay.request.body).toEqual({ paymentDate: todayIso() });
    pay.flush({ ...futureIncome, status: 'PAID' });
    listRequest(http).flush(page([]));
  });

  it('editar receita já recebida envia a nova data do recebimento com a versão', async () => {
    const { http, el, fixture } = await setup([receivedIncome]);
    (Array.from(rowOf(el, 'Bônus').querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Editar') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('label[for="editDue"]')?.textContent).toContain('Data do recebimento');
    expect(el.querySelector('[role="dialog"]')?.textContent).toContain('Entra na conta na data informada');

    const future = dayIso(20);
    fillDate(el, '#editDue', future);
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')?.textContent).toContain('Fica a receber até');

    clickButton(el, 'Salvar');
    const patch = http.expectOne({ method: 'PATCH', url: `${API}/transactions/6` });
    expect(patch.request.body).toMatchObject({ dueDate: future, version: 0 });
    patch.flush({ ...receivedIncome, dueDate: future, status: 'PENDING' });
    listRequest(http).flush(page([]));
  });

  it('excluir receita avulsa recebida avisa que o valor sai do saldo', async () => {
    const { http, el, fixture } = await setup([receivedIncome]);
    (Array.from(rowOf(el, 'Bônus').querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Excluir') as HTMLButtonElement).click();
    http
      .expectOne({ method: 'GET', url: `${API}/transaction-groups/105/impact` })
      .flush({ paidCount: 1, pendingCount: 0, paidAmount: '800.00', pendingAmount: '0.00' });
    fixture.detectChanges();
    expect(el.querySelector('[role="alertdialog"]')?.textContent).toContain('sai do saldo da conta');
    expect(el.querySelector('[role="alertdialog"]')?.textContent).toContain('R$ 800,00');
    clickButton(el, 'Excluir "Bônus"');
    http.expectOne((r) => r.method === 'DELETE' && r.url === `${API}/transaction-groups/105`).flush(null, { status: 204, statusText: 'No Content' });
    listRequest(http).flush(page([]));
  });

  it('lançamento fixo oferece alterar o valor a partir do mês e encerrar (com confirmação)', async () => {
    const { http, el, fixture } = await setup();
    const row = Array.from(el.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes('Salário')) as HTMLElement;
    expect(row.textContent).toContain('Alterar valor daqui');
    (Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Encerrar aqui') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectNone({ method: 'POST', url: `${API}/transaction-groups/103/end` });
    expect(el.querySelector('[role="alertdialog"]')?.textContent).toContain('Encerrar Salário em 11/2026?');
    expect(el.querySelector('[role="alertdialog"]')?.textContent).toContain('as já pagas e as anteriores permanecem');
    clickButton(el, 'Encerrar lançamento');
    const end = http.expectOne({ method: 'POST', url: `${API}/transaction-groups/103/end` });
    expect(end.request.body).toEqual({ endMonth: '2026-11' });
    end.flush({});
    listRequest(http).flush(page([]));
  });

  it('erro do servidor ao pagar aparece como alerta', async () => {
    const { http, el, fixture } = await setup();
    const row = Array.from(el.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes('Mercado')) as HTMLElement;
    (Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Pagar') as HTMLButtonElement).click();
    fixture.detectChanges();
    clickButton(el, 'Confirmar');
    http.expectOne({ method: 'POST', url: `${API}/transactions/1/pay` }).flush(
      { code: 'CONFLICT', detail: 'Este lançamento já está pago.' },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();
    expect(el.textContent).toContain('Este lançamento já está pago.');
  });

  it('abre já filtrada pelos parâmetros da rota (toque em um lembrete)', async () => {
    const ctx = (() => {
      TestBed.configureTestingModule({
        providers: [{ provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ month: '2026-12', status: 'PENDING' }) } } }],
      });
      return configureHttpTesting();
    })();
    const fixture = TestBed.createComponent(TransactionsPage);
    fixture.detectChanges();

    const request = ctx.http.expectOne((r) => r.url === `${API}/transactions`);
    expect(request.request.params.get('month')).toBe('2026-12');
    expect(request.request.params.get('status')).toBe('PENDING');
    request.flush(page([]));
    ctx.flushReference();
  });

  describe('no celular (layout compacto)', () => {
    const compact = { compact: true };

    it('mostra cartões em vez de tabela, com data, categoria, conta, valor e status', async () => {
      const { el } = await setup(undefined, compact);

      expect(el.querySelector('table')).toBeNull();
      const cards = el.querySelectorAll('[data-testid="transaction-card"]');
      expect(cards).toHaveLength(4);
      const mercado = cards[0].textContent ?? '';
      for (const text of ['Mercado', 'R$ 150,00', '15/11/2026', 'Alimentação', 'Itaú', 'Pend']) {
        expect(mercado).toContain(text);
      }
      expect(cards[1].textContent).toContain('Vencido');
      expect(cards[2].textContent).toContain('Pago');
      expect(el.textContent).toContain('4 lançamento(s)');
    });

    it('cada ação tem rótulo acessível com o nome do lançamento e área de toque confortável', async () => {
      const { el } = await setup(undefined, compact);

      for (const label of ['Pagar Mercado', 'Editar Mercado', 'Excluir Mercado', 'Desfazer Cinema', 'Alterar valor Salário', 'Encerrar Salário']) {
        const button = el.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
        expect(button).not.toBeNull();
        expect(button.className).toContain('gef-btn-sm');
      }
    });

    it('Novo lançamento e Filtros dividem a mesma linha e Filtros não ocupa a linha inteira', async () => {
      const { el, http } = await setup(undefined, compact);
      const filters = Array.from(el.querySelectorAll('header button')).find((b) => b.textContent?.includes('Filtros')) as HTMLElement;
      const create = Array.from(el.querySelectorAll('header button')).find((b) => b.textContent?.includes('Novo lançamento')) as HTMLElement;
      expect(filters.parentElement).toBe(create.parentElement);
      expect(filters.className).not.toContain('w-full');
      expect(create.className).toContain('flex-1');
      expect(el.querySelectorAll('button.w-full').length).toBe(0);
      http.verify();
    });

    it('os filtros ficam atrás do botão Filtros e aplicam a consulta', async () => {
      const { http, el, fixture } = await setup(undefined, compact);
      expect(el.querySelector('gef-select')).toBeNull();

      clickButton(el, 'Filtros');
      fixture.detectChanges();
      expect(el.querySelector('[role="dialog"][aria-label="Filtros"]')).not.toBeNull();
      pickOption(fixture, 'Status', 'Pendentes');
      fixture.detectChanges();

      const request = listRequest(http);
      expect(request.request.params.get('status')).toBe('PENDING');
      request.flush(page([pending]));
    });

    it('pagar abre o painel inferior e confirma o pagamento', async () => {
      const { http, el, fixture } = await setup(undefined, compact);

      (el.querySelector('button[aria-label="Pagar Mercado"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const dialog = el.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog.classList).toContain('gef-sheet');
      expect(dialog.textContent).toContain('Registrar o pagamento de');

      clickButton(el, 'Confirmar');
      const pay = http.expectOne({ method: 'POST', url: `${API}/transactions/1/pay` });
      expect(pay.request.body).toEqual({ paymentDate: todayIso() });
      pay.flush({ ...pending, status: 'PAID', paymentDate: todayIso() });
      listRequest(http).flush(page([]));
    });

    it('pagar com a data apagada mostra o aviso dentro do painel inferior, junto ao campo', async () => {
      const { http, el, fixture } = await setup(undefined, compact);

      (el.querySelector('button[aria-label="Pagar Mercado"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      type(el, '#paymentDate', '');
      clickButton(el, 'Confirmar');
      fixture.detectChanges();

      http.expectNone({ method: 'POST', url: `${API}/transactions/1/pay` });
      const sheet = el.querySelector('[role="dialog"].gef-sheet') as HTMLElement;
      const alert = sheet.querySelector('[role="alert"]') as HTMLElement;
      expect(alert.textContent).toContain('Informe uma data válida');
      expect(el.querySelectorAll('[role="alert"]')).toHaveLength(1);
    });

    it('Novo lançamento abre o formulário em um painel inferior', async () => {
      const { el, fixture, flushReference } = await setup(undefined, compact);

      clickButton(el, 'Novo lançamento');
      fixture.detectChanges();
      flushReference(); // o formulário atualiza contas e categorias ao abrir
      fixture.detectChanges();

      const dialog = el.querySelector('[role="dialog"][aria-label="Novo lançamento"]') as HTMLElement;
      expect(dialog).not.toBeNull();
      expect(dialog.querySelector('form')).not.toBeNull();
    });
  });
});

describe('TransactionsPage - toque duplo', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('tocar duas vezes em Confirmar registra o pagamento uma única vez', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(TransactionsPage);
    fixture.detectChanges();
    ctx.http.expectOne((r) => r.url === `${API}/transactions`).flush(page([pending]));
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Pagar') as HTMLButtonElement).click();
    fixture.detectChanges();
    const confirm = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Confirmar') as HTMLButtonElement;
    confirm.click();
    confirm.click();

    ctx.http.expectOne({ method: 'POST', url: `${API}/transactions/1/pay` }).flush({ ...pending, status: 'PAID' });
    ctx.http.expectOne((r) => r.method === 'GET' && r.url === `${API}/transactions`).flush(page([]));
  });
});

describe('TransactionsPage - dados que mudam por fora da tela', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('recarrega a lista quando as operações pendentes são enviadas', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(TransactionsPage);
    fixture.detectChanges();
    ctx.http.expectOne((r) => r.url === `${API}/transactions`).flush(page([pending]));
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();

    TestBed.inject(NoticeService).dataChanged();
    fixture.detectChanges();
    await fixture.whenStable();

    ctx.http.expectOne((r) => r.method === 'GET' && r.url === `${API}/transactions`).flush(page([paid]));
  });
});

describe('TransactionsPage - itens pendentes de envio (app móvel)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  async function setup(compact: boolean) {
    TestBed.configureTestingModule({
      providers: [
        { provide: Viewport, useValue: { compact: signal(compact) } },
        { provide: PENDING_MARKER, useValue: (tx: { id: number }) => tx.id === 1 },
      ],
    });
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(TransactionsPage);
    fixture.detectChanges();
    ctx.http.expectOne((r) => r.url === `${API}/transactions`).flush(page([pending, late]));
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('no celular, o item pendente de envio mostra o selo e não oferece ações; os demais seguem normais', async () => {
    const el = await setup(true);
    const cards = el.querySelectorAll('[data-testid="transaction-card"]');

    expect(cards[0].textContent).toContain('Pendente de envio');
    expect(cards[0].querySelectorAll('button')).toHaveLength(0);
    expect(cards[1].textContent).not.toContain('Pendente de envio');
    expect(cards[1].querySelector('button[aria-label="Pagar Luz"]')).not.toBeNull();
  });

  it('na tabela também', async () => {
    const el = await setup(false);
    const rows = el.querySelectorAll('tbody tr');

    expect(rows[0].textContent).toContain('Pendente de envio');
    expect(rows[0].querySelectorAll('button')).toHaveLength(0);
    expect(rows[1].querySelector('button')).not.toBeNull();
  });
});

describe('TransactionsPage - alterações pendentes de envio e exclusão sem conexão (app móvel)', () => {
  afterEach(() => {
    jest.useRealTimers();
    TestBed.inject(HttpTestingController).verify();
  });

  async function setup(options: { compact?: boolean; offlineWrites?: boolean } = {}) {
    TestBed.configureTestingModule({
      providers: [
        { provide: Viewport, useValue: { compact: signal(options.compact ?? false) } },
        { provide: PENDING_CHANGE, useValue: (tx: { id: number }) => tx.id === 2 },
        { provide: OFFLINE_WRITES, useValue: options.offlineWrites ?? true },
      ],
    });
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(TransactionsPage);
    fixture.detectChanges();
    ctx.http.expectOne((r) => r.url === `${API}/transactions`).flush(page([pending, late]));
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  const listRequest = (http: HttpTestingController) => http.expectOne((r) => r.method === 'GET' && r.url === `${API}/transactions`);
  const offlineError = { status: 0, statusText: 'Offline' };
  const clickDelete = (el: HTMLElement, description: string) =>
    (el.querySelector(`button[aria-label="Excluir ${description}"]`) as HTMLButtonElement).click();

  it('item real com alteração pendente mostra o selo e continua com as ações (pagar, editar, excluir)', async () => {
    const { el } = await setup({ compact: true });
    const cards = el.querySelectorAll('[data-testid="transaction-card"]');

    expect(cards[0].textContent).not.toContain('Pendente de envio');
    expect(cards[1].textContent).toContain('Pendente de envio');
    for (const label of ['Pagar Luz', 'Editar Luz', 'Excluir Luz']) {
      expect(cards[1].querySelector(`button[aria-label="${label}"]`)).not.toBeNull();
    }
  });

  it('na tabela também', async () => {
    const { el } = await setup({ compact: false });
    const rows = el.querySelectorAll('tbody tr');

    expect(rows[0].textContent).not.toContain('Pendente de envio');
    expect(rows[1].textContent).toContain('Pendente de envio');
    expect(rows[1].querySelector('button[aria-label="Editar Luz"]')).not.toBeNull();
  });

  it('sem conexão, excluir abre a confirmação mesmo sem o impacto, avisando que será aplicado ao reconectar', async () => {
    const { http, el, fixture } = await setup();

    clickDelete(el, 'Mercado');
    http.expectOne({ method: 'GET', url: `${API}/transaction-groups/100/impact` }).flush({ code: 'OFFLINE_REQUIRES_CONNECTION' }, offlineError);
    fixture.detectChanges();

    const dialog = el.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('Excluir Mercado?');
    expect(dialog.querySelector('[data-testid="delete-offline-note"]')?.textContent).toContain('será aplicada quando a conexão voltar');
    expect(dialog.textContent).not.toContain('NaN');
    http.expectNone((r) => r.method === 'DELETE');

    clickButton(el, 'Excluir "Mercado"');
    const del = http.expectOne((r) => r.method === 'DELETE' && r.url === `${API}/transaction-groups/100`);
    expect(del.request.params.get('confirm')).toBe('true');
    del.flush({}, { status: 202, statusText: 'Accepted' });
    listRequest(http).flush(page([late]));
    fixture.detectChanges();
    expect(TestBed.inject(NoticeService).toasts()[0].message).toBe('Exclusão registrada. Será aplicada quando a conexão voltar.');
  });

  it('com conexão (impacto consultado e exclusão aplicada na hora), o aviso diz que o lançamento foi excluído', async () => {
    const { http, el, fixture } = await setup();

    clickDelete(el, 'Mercado');
    http.expectOne({ method: 'GET', url: `${API}/transaction-groups/100/impact` }).flush({ paidCount: 0, pendingCount: 1, paidAmount: '0.00', pendingAmount: '150.00' });
    fixture.detectChanges();
    clickButton(el, 'Excluir "Mercado"');
    http.expectOne((r) => r.method === 'DELETE' && r.url === `${API}/transaction-groups/100`).flush(null, { status: 204, statusText: 'No Content' });
    listRequest(http).flush(page([late]));

    expect(TestBed.inject(NoticeService).toasts()[0].message).toBe('Lançamento excluído.');
  });

  it('impacto consultado, mas a exclusão falha por rede e vai para a fila (202): o aviso diz que foi registrada, não excluída', async () => {
    const { http, el, fixture } = await setup();

    clickDelete(el, 'Mercado');
    http.expectOne({ method: 'GET', url: `${API}/transaction-groups/100/impact` }).flush({ paidCount: 0, pendingCount: 1, paidAmount: '0.00', pendingAmount: '150.00' });
    fixture.detectChanges();
    clickButton(el, 'Excluir "Mercado"');
    http.expectOne((r) => r.method === 'DELETE').flush({}, { status: 202, statusText: 'Accepted' });
    listRequest(http).flush(page([late]));

    expect(TestBed.inject(NoticeService).toasts()[0].message).toBe('Exclusão registrada. Será aplicada quando a conexão voltar.');
  });

  it('sem o impacto mas com a exclusão aplicada na hora (rede lenta que respondeu ao DELETE): o aviso diz que foi excluído', async () => {
    jest.useFakeTimers();
    const { http, el, fixture } = await setup();

    clickDelete(el, 'Mercado');
    http.expectOne({ method: 'GET', url: `${API}/transaction-groups/100/impact` });
    await jest.advanceTimersByTimeAsync(3_001);
    fixture.detectChanges();
    clickButton(el, 'Excluir "Mercado"');
    http.expectOne((r) => r.method === 'DELETE').flush(null, { status: 204, statusText: 'No Content' });
    listRequest(http).flush(page([late]));

    expect(TestBed.inject(NoticeService).toasts()[0].message).toBe('Lançamento excluído.');
  });

  it('com conexão, a confirmação continua mostrando o impacto, sem o aviso de reconexão', async () => {
    const { http, el, fixture } = await setup();

    clickDelete(el, 'Mercado');
    http.expectOne({ method: 'GET', url: `${API}/transaction-groups/100/impact` }).flush({ paidCount: 2, pendingCount: 3, paidAmount: '20.00', pendingAmount: '30.00' });
    fixture.detectChanges();

    const dialog = el.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('3 lançamento(s)');
    expect(dialog.querySelector('[data-testid="delete-offline-note"]')).toBeNull();
  });

  it('rede "conectada" que não responde: o impacto não é esperado para sempre, a confirmação abre depois de alguns segundos', async () => {
    jest.useFakeTimers();
    const { http, el, fixture } = await setup();

    clickDelete(el, 'Mercado');
    const impact = http.expectOne({ method: 'GET', url: `${API}/transaction-groups/100/impact` });
    await jest.advanceTimersByTimeAsync(2_999);
    fixture.detectChanges();
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
    await jest.advanceTimersByTimeAsync(2);
    fixture.detectChanges();

    expect(impact.cancelled).toBe(true);
    // rede lenta, não ausente: o aviso não diz "Sem conexão"
    const note = el.querySelector('[data-testid="delete-offline-note"]')?.textContent ?? '';
    expect(note).toContain('conexão está lenta');
    expect(note).not.toContain('Sem conexão');
  });

  it('erro do servidor ao consultar o impacto continua sendo mostrado como erro, sem abrir a confirmação', async () => {
    const { http, el, fixture } = await setup();

    clickDelete(el, 'Mercado');
    http.expectOne({ method: 'GET', url: `${API}/transaction-groups/100/impact` }).flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('erro inesperado');
  });

  it('no web (sem fila offline), falta de conexão ao consultar o impacto segue sendo um erro, sem confirmação', async () => {
    const { http, el, fixture } = await setup({ offlineWrites: false });

    clickDelete(el, 'Mercado');
    http.expectOne({ method: 'GET', url: `${API}/transaction-groups/100/impact` }).flush({}, offlineError);
    fixture.detectChanges();

    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Sem conexão');
  });

  it('editar valor e vencimento sem conexão: o envio é aceito, a lista recarrega e o painel fecha', async () => {
    const { http, el, fixture } = await setup();

    (el.querySelector('button[aria-label="Editar Luz"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    fillDate(el, '#editDue', '2026-11-25');
    clickButton(el, 'Salvar');
    const patch = http.expectOne((r) => r.method === 'PATCH' && r.url === `${API}/transactions/2`);
    expect(patch.request.body).toMatchObject({ dueDate: '2026-11-25', version: 0 });
    patch.flush({}, { status: 202, statusText: 'Accepted' });
    listRequest(http).flush(page([pending, late]));
    fixture.detectChanges();

    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });
});
