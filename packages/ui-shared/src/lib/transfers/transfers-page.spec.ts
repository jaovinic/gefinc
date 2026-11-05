import { HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Account, Transfer } from '@gefinc/core-models';
import { currentMonth } from '@gefinc/utils';
import { API, clickButton, configureHttpTesting, pickOption, type } from '../../testing/testbed';
import { NoticeService } from '../api';
import { Viewport } from '../viewport/viewport';
import { TransfersPage } from './transfers-page';

const itau = { id: 1, name: 'Itaú', type: 'CHECKING', holderType: 'PF', icon: 'bank', active: true, version: 0 } as Account;
const carteira = { id: 2, name: 'Carteira', type: 'CASH', icon: 'cash', active: true, version: 0 } as Account;
const nubank = { id: 3, name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, bankAccountId: 1, active: true, version: 0 } as Account;
const velha = { id: 4, name: 'Velha', type: 'CHECKING', holderType: 'PF', icon: 'bank', active: false, version: 0 } as Account;

const sent: Transfer = { id: 11, fromAccountId: 1, toAccountId: 2, amount: '250.00', transferDate: '2026-11-08', description: 'Saque do mês', scheduled: false, version: 0 };
const scheduled: Transfer = { id: 12, fromAccountId: 2, toAccountId: 1, amount: '30.50', transferDate: '2099-01-20', scheduled: true, version: 2 };
const balances = {
  asOf: '2026-11-10',
  total: '1050.00',
  accounts: [
    { accountId: 1, name: 'Itaú', type: 'CHECKING', active: true, balance: '1000.00', openingBalance: '0.00' },
    { accountId: 2, name: 'Carteira', type: 'CASH', active: true, balance: '50.00', openingBalance: '0.00' },
  ],
  unlinkedCardPayments: '0.00',
};

function page(content: Transfer[], total = content.length) {
  return { content, page: 0, size: 25, totalElements: total };
}

describe('TransfersPage', () => {
  async function setup(content: Transfer[] = [sent, scheduled], options: { compact?: boolean; accounts?: Account[] } = {}) {
    if (options.compact !== undefined) {
      TestBed.configureTestingModule({ providers: [{ provide: Viewport, useValue: { compact: signal(options.compact) } }] });
    }
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(TransfersPage);
    fixture.detectChanges();
    ctx.http.expectOne((r) => r.method === 'GET' && r.url === `${API}/transfers`).flush(page(content));
    ctx.http.expectOne((r) => r.url === `${API}/accounts`).flush(options.accounts ?? [itau, carteira, nubank, velha]);
    ctx.http.expectOne((r) => r.url === `${API}/categories`).flush([]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  const list = (http: HttpTestingController) => http.expectOne((r) => r.method === 'GET' && r.url === `${API}/transfers`);
  const texts = (el: HTMLElement, selector: string) => Array.from(el.querySelectorAll(selector)).map((n) => n.textContent?.trim());

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('pede o mês atual com paginação e mostra carregamento até a resposta', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(TransfersPage);
    fixture.detectChanges();
    const request = list(ctx.http);
    expect(request.request.params.get('month')).toBe(currentMonth());
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('25');
    expect(request.request.params.has('accountId')).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Carregando transferências');
    request.flush(page([]));
    ctx.flushReference();
  });

  it('lista origem para destino, valor, data, descrição e o selo Agendada', async () => {
    const { el } = await setup();
    expect(texts(el, '[data-testid="transfer-row"] [data-testid="transfer-label"]')).toEqual(['Itaú para Carteira', 'Carteira para Itaú']);
    expect(texts(el, '[data-testid="transfer-amount"]').map((t) => t?.replace(/\s/g, ' '))).toEqual(['R$ 250,00', 'R$ 30,50']);
    expect(el.textContent).toContain('08/11/2026');
    expect(el.textContent).toContain('Saque do mês');
    const badges = el.querySelectorAll('[data-testid="scheduled-badge"]');
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toContain('Agendada');
    expect(badges[0].querySelector('svg')).not.toBeNull();
  });

  it('no formato compacto mostra cartões com os mesmos dados e ações', async () => {
    const { el } = await setup([sent, scheduled], { compact: true });
    const cards = el.querySelectorAll('[data-testid="transfer-card"]');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('Itaú para Carteira');
    expect(cards[0].querySelector('[data-testid="scheduled-badge"]')).toBeNull();
    expect(cards[1].querySelector('[data-testid="scheduled-badge"]')).not.toBeNull();
    expect(cards[0].querySelector('button[aria-label="Editar Itaú para Carteira"]')).not.toBeNull();
    expect(cards[0].querySelector('button[aria-label="Excluir Itaú para Carteira"]')).not.toBeNull();
  });

  it('o filtro por conta pede só as transferências da conta e rotula pela perspectiva dela', async () => {
    const { http, fixture, el } = await setup();
    pickOption(fixture, 'Filtrar por conta', 'Itaú');
    const filtered = list(http);
    expect(filtered.request.params.get('accountId')).toBe('1');
    filtered.flush(page([sent, scheduled]));
    fixture.detectChanges();

    expect(texts(el, '[data-testid="transfer-label"]')).toEqual(['Transferência para Carteira', 'Transferência de Carteira']);

    pickOption(fixture, 'Filtrar por conta', 'Todas as contas');
    const all = list(http);
    expect(all.request.params.has('accountId')).toBe(false);
    all.flush(page([]));
  });

  it('o filtro de conta não oferece cartão de crédito', async () => {
    const { fixture } = await setup();
    const trigger = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('gef-select')).find((s) => s.textContent?.includes('Todas as contas')) as HTMLElement;
    (trigger.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const options = Array.from(trigger.querySelectorAll('[role="option"]')).map((o) => o.textContent?.trim());
    expect(options).toEqual(['Todas as contas', 'Itaú', 'Carteira', 'Velha']);
  });

  it('trocar o mês recarrega a lista do novo mês', async () => {
    const { http, fixture, el } = await setup();
    (el.querySelector('button[aria-label="Próximo mês"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const request = list(http);
    expect(request.request.params.get('month')).not.toBe(currentMonth());
    request.flush(page([]));
  });

  it('mês sem transferências mostra o estado vazio com orientação', async () => {
    const { el } = await setup([]);
    expect(el.textContent).toContain('Nenhuma transferência neste mês');
    expect(el.textContent).toContain('Mova saldo entre suas contas');
  });

  it('falha ao carregar mostra o erro com nova tentativa', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(TransfersPage);
    fixture.detectChanges();
    list(ctx.http).flush({}, { status: 500, statusText: 'Server Error' });
    ctx.flushReference();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('erro inesperado');
    clickButton(el, 'Tentar novamente');
    list(ctx.http).flush(page([]));
  });

  it('sem conexão e sem cópia local mostra o aviso de "Sem conexão"', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(TransfersPage);
    fixture.detectChanges();
    list(ctx.http).flush({ code: 'OFFLINE_NO_DATA' }, { status: 0, statusText: 'Offline' });
    ctx.flushReference();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-variant="offline"]')?.textContent).toContain('Sem conexão');
  });

  it('a paginação pede a próxima página', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(TransfersPage);
    fixture.detectChanges();
    list(ctx.http).flush(page([sent], 40));
    ctx.flushReference();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('40 transferência(s)');
    clickButton(el, 'Próxima');
    const next = list(ctx.http);
    expect(next.request.params.get('page')).toBe('1');
    next.flush(page([], 40));
  });

  describe('nova transferência', () => {
    it('com duas ou mais contas elegíveis o botão abre o formulário e registrar mostra a confirmação e recarrega', async () => {
      const { http, fixture, el } = await setup([]);
      const notices = TestBed.inject(NoticeService);
      const button = Array.from(el.querySelectorAll('header button')).find((b) => b.textContent?.includes('Nova transferência')) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      expect(el.querySelector('[data-testid="create-hint"]')).toBeNull();

      button.click();
      fixture.detectChanges();
      http.expectOne({ method: 'GET', url: `${API}/balances` }).flush(balances);
      fixture.detectChanges();
      expect(document.querySelector('[role="dialog"][aria-label="Nova transferência"]')).not.toBeNull();

      (document.querySelector('[data-field="fromAccountId"] button[aria-haspopup]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (document.querySelector('[role="option"][data-account-id="1"]') as HTMLElement).click();
      fixture.detectChanges();
      (document.querySelector('[data-field="toAccountId"] button[aria-haspopup]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (document.querySelector('[role="option"][data-account-id="2"]') as HTMLElement).click();
      fixture.detectChanges();
      type(document.body, 'gef-money-input input', '1000');
      (document.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      http.expectOne({ method: 'POST', url: `${API}/transfers` }).flush({ ...sent, amount: '10.00' }, { status: 201, statusText: 'Created' });
      fixture.detectChanges();

      expect(notices.toasts()[0].message).toBe('Transferência registrada.');
      expect(document.querySelector('[role="dialog"][aria-label="Nova transferência"]')).toBeNull();
      list(http).flush(page([sent]));
    });

    it('com menos de duas contas elegíveis o botão fica desabilitado e a tela explica o motivo', async () => {
      const { el } = await setup([], { accounts: [itau, nubank, velha] });
      const button = Array.from(el.querySelectorAll('header button')).find((b) => b.textContent?.includes('Nova transferência')) as HTMLButtonElement;

      expect(button.disabled).toBe(true);
      expect(el.querySelector('[data-testid="create-hint"]')?.textContent).toContain('pelo menos duas contas');
      expect(Array.from(el.querySelectorAll('gef-empty button'))).toHaveLength(0);
    });
  });

  describe('editar', () => {
    it('abre o formulário com a transferência e salva com PUT, avisando e recarregando', async () => {
      const { http, fixture, el } = await setup();
      const notices = TestBed.inject(NoticeService);
      (el.querySelector('button[aria-label="Editar Itaú para Carteira"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      http.expectOne({ method: 'GET', url: `${API}/balances` }).flush(balances);
      fixture.detectChanges();

      expect(document.querySelector('[role="dialog"][aria-label="Editar transferência"]')).not.toBeNull();
      expect((document.querySelector('gef-money-input input') as HTMLInputElement).value).toBe('250,00');
      type(document.body, 'gef-money-input input', '30000');
      (document.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      const put = http.expectOne({ method: 'PUT', url: `${API}/transfers/11` });
      expect(put.request.body).toMatchObject({ amount: '300.00', version: 0, description: 'Saque do mês' });
      put.flush({ ...sent, amount: '300.00', version: 1 });
      fixture.detectChanges();

      expect(notices.toasts()[0].message).toBe('Transferência atualizada.');
      list(http).flush(page([{ ...sent, amount: '300.00', version: 1 }]));
    });
  });

  describe('excluir', () => {
    async function openDelete() {
      const ctx = await setup();
      (ctx.el.querySelector('button[aria-label="Excluir Itaú para Carteira"]') as HTMLButtonElement).click();
      ctx.fixture.detectChanges();
      return ctx;
    }
    const dialog = () => document.querySelector('[role="alertdialog"]') as HTMLElement | null;
    const confirm = () => document.querySelector('[data-testid="confirm-confirm"]') as HTMLButtonElement;

    it('pede confirmação explicando o estorno e não exclui antes de confirmar', async () => {
      const { http } = await openDelete();
      http.expectNone({ method: 'DELETE', url: `${API}/transfers/11` });
      expect(dialog()?.textContent).toContain('Itaú para Carteira');
      expect(dialog()?.textContent).toContain('R$ 250,00');
      expect(dialog()?.textContent).toContain('O saldo das duas contas volta ao que era');
    });

    it('cancelar fecha sem excluir', async () => {
      const { http, fixture } = await openDelete();
      (document.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(dialog()).toBeNull();
      http.expectNone({ method: 'DELETE', url: `${API}/transfers/11` });
    });

    it('confirmar envia DELETE com Idempotency-Key, avisa e recarrega a lista', async () => {
      const { http, fixture } = await openDelete();
      const notices = TestBed.inject(NoticeService);
      confirm().click();
      const del = http.expectOne({ method: 'DELETE', url: `${API}/transfers/11` });
      expect(del.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
      fixture.detectChanges();
      expect(confirm().disabled).toBe(true);
      del.flush(null, { status: 204, statusText: 'No Content' });
      fixture.detectChanges();

      expect(dialog()).toBeNull();
      expect(notices.toasts()[0].message).toBe('Transferência excluída.');
      list(http).flush(page([scheduled]));
    });

    it('falha de rede mantém o diálogo com o erro e o reenvio usa a mesma chave', async () => {
      const { http, fixture } = await openDelete();
      confirm().click();
      const first = http.expectOne({ method: 'DELETE', url: `${API}/transfers/11` });
      const key = first.request.headers.get('Idempotency-Key');
      first.error(new ProgressEvent('error'), { status: 0 });
      fixture.detectChanges();
      expect(document.querySelector('[data-testid="confirm-error"]')?.textContent).toContain('Sem conexão');

      confirm().click();
      const retry = http.expectOne({ method: 'DELETE', url: `${API}/transfers/11` });
      expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
      retry.flush(null, { status: 204, statusText: 'No Content' });
      list(http).flush(page([]));
    });

    it('transferência que já não existe fecha o diálogo, avisa e recarrega', async () => {
      const { http, fixture } = await openDelete();
      const notices = TestBed.inject(NoticeService);
      confirm().click();
      http.expectOne({ method: 'DELETE', url: `${API}/transfers/11` }).flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(dialog()).toBeNull();
      expect(notices.toasts()[0].message).toBe('A transferência já havia sido excluída.');
      list(http).flush(page([]));
    });
  });
});
