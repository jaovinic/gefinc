import { HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { currentMonth, todayIso } from '@gefinc/utils';
import { API, clickButton, configureHttpTesting, select } from '../../testing/testbed';
import { NoticeService } from '../api';
import { PENDING_MARKER } from './transactions-page';
import { Viewport } from '../viewport/viewport';
import { TransactionsPage } from './transactions-page';

const pending = {
  id: 1, groupId: 100, accountId: 1, categoryId: 10, description: 'Mercado', recurrenceType: 'VARIABLE',
  installmentNumber: 1, totalInstallments: 1, amount: '150.00', dueDate: '2026-11-15', status: 'PENDING', overdue: false, version: 0,
};
const late = { ...pending, id: 2, groupId: 101, description: 'Luz', amount: '90.50', dueDate: '2026-11-05', overdue: true };
const paid = { ...pending, id: 3, groupId: 102, description: 'Cinema', categoryId: 11, status: 'PAID', paymentDate: '2026-11-08', dueDate: '2026-11-08' };
const fixedIncome = { ...pending, id: 4, groupId: 103, description: 'Salário', categoryId: 20, recurrenceType: 'FIXED', amount: '5000.00', dueDate: '2026-11-05' };

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

  it('desfazer o pagamento recarrega a lista', async () => {
    const { http, el } = await setup();
    clickButton(el, 'Desfazer');
    http.expectOne({ method: 'POST', url: `${API}/transactions/3/unpay` }).flush({ ...paid, status: 'PENDING' });
    listRequest(http).flush(page([]));
  });

  it('mudar o filtro de status volta à primeira página e consulta de novo', async () => {
    const { http, el, fixture } = await setup();
    select(el, 'select[aria-label="Status"]', 'PAID');
    fixture.detectChanges();
    const request = listRequest(http);
    expect(request.request.params.get('status')).toBe('PAID');
    expect(request.request.params.get('page')).toBe('0');
    request.flush(page([paid]));
  });

  it('excluir mostra o impacto e só então confirma a exclusão do grupo', async () => {
    const { http, el, fixture } = await setup();
    const row = Array.from(el.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes('Mercado')) as HTMLElement;
    (Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Excluir') as HTMLButtonElement).click();
    http
      .expectOne({ method: 'GET', url: `${API}/transaction-groups/100/impact` })
      .flush({ paidCount: 2, pendingCount: 3, paidAmount: '20.00', pendingAmount: '30.00' });
    fixture.detectChanges();

    expect(el.querySelector('[role="dialog"]')?.textContent).toContain('3 lançamento(s)');
    expect(el.querySelector('[role="dialog"]')?.textContent).toContain('2 já pago(s) serão preservados');
    clickButton(el, 'Excluir');
    const del = http.expectOne((r) => r.method === 'DELETE' && r.url === `${API}/transaction-groups/100`);
    expect(del.request.params.get('confirm')).toBe('true');
    del.flush(null, { status: 204, statusText: 'No Content' });
    listRequest(http).flush(page([]));
  });

  it('lançamento fixo oferece alterar o valor a partir do mês e encerrar', async () => {
    const { http, el } = await setup();
    const row = Array.from(el.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes('Salário')) as HTMLElement;
    expect(row.textContent).toContain('Alterar valor daqui');
    (Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Encerrar aqui') as HTMLButtonElement).click();
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
        expect(button.className).toContain('gef-action');
      }
    });

    it('os filtros ficam atrás do botão Filtros e aplicam a consulta', async () => {
      const { http, el, fixture } = await setup(undefined, compact);
      expect(el.querySelector('select[aria-label="Status"]')).toBeNull();

      clickButton(el, 'Filtros');
      fixture.detectChanges();
      expect(el.querySelector('[role="dialog"][aria-label="Filtros"]')).not.toBeNull();
      select(el, 'select[aria-label="Status"]', 'PENDING');
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
