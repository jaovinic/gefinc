import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL, CLIENT_KIND, MemoryTokenStore, NoticeService, TokenStore, authInterceptor } from '../api';
import { Viewport } from '../viewport/viewport';
import { pickOption, selectTrigger } from '../../testing/testbed';
import { AccountsPage } from './accounts-page';

const API = '/api/v1';
const itau = { id: 7, name: 'Itaú pessoal', type: 'CHECKING', holderType: 'PF', icon: 'bank', active: true, version: 1 };
const inter = { id: 8, name: 'Inter empresa', type: 'CHECKING', holderType: 'PJ', icon: 'building', active: true, version: 1 };
const nubank = {
  id: 1, name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, holderType: 'PF', icon: 'card',
  bankAccountId: 7, bankAccountName: 'Itaú pessoal', active: true, version: 0,
};
const carteira = { id: 2, name: 'Carteira', type: 'CASH', icon: 'cash', active: true, version: 3 };
const antigo = { id: 3, name: 'Cartão antigo', type: 'CREDIT_CARD', closingDay: 1, dueDay: 8, icon: 'card', active: true, version: 0 };

const noBalances = { asOf: '2026-11-10', total: '0.00', accounts: [], unlinkedCardPayments: '0.00' };
const withBalances = {
  asOf: '2026-11-10',
  total: '1300.00',
  accounts: [
    { accountId: 7, name: 'Itaú pessoal', type: 'CHECKING', active: true, balance: '1500.00', openingBalance: '0.00' },
    { accountId: 2, name: 'Carteira', type: 'CASH', active: true, balance: '-200.00', openingBalance: '0.00' },
  ],
  unlinkedCardPayments: '0.00',
};

function setup(compact = false) {
  TestBed.configureTestingModule({
    providers: [
      { provide: Viewport, useValue: { compact: signal(compact) } },
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: API },
      { provide: CLIENT_KIND, useValue: 'web' },
      { provide: TokenStore, useClass: MemoryTokenStore },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(AccountsPage);
  fixture.detectChanges();
  const expectList = (inactive: boolean) =>
    http.expectOne((r) => r.method === 'GET' && r.url === `${API}/accounts` && r.params.get('includeInactive') === String(inactive));
  const expectBalances = () => http.expectOne((r) => r.method === 'GET' && r.url === `${API}/balances`);
  return { http, fixture, el: fixture.nativeElement as HTMLElement, expectList, expectBalances };
}

function click(el: HTMLElement, label: string) {
  const button = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
  button.click();
}

function type(el: HTMLElement, selector: string, value: string) {
  const input = el.querySelector(selector) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('AccountsPage', () => {
  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    // Os saldos têm carga própria: o que um teste não tratou é respondido aqui, antes de conferir pendências.
    http.match((r) => r.method === 'GET' && r.url === `${API}/balances`).forEach((r) => r.flush(noBalances));
    http.verify();
  });

  it('mostra carregamento e depois a tabela com tipo e dias do cartão', async () => {
    const { el, fixture, expectList } = setup();
    expect(el.textContent).toContain('Carregando contas');

    expectList(false).flush([nubank, carteira]);
    fixture.detectChanges();

    expect(el.textContent).toContain('Nubank');
    expect(el.textContent).toContain('Cartão de crédito');
    expect(el.textContent).toContain('dia 10');
    expect(el.textContent).toContain('dia 17');
    expect(el.textContent).toContain('Dinheiro');
  });

  it('sem contas mostra o estado vazio com orientação', async () => {
    const { el, fixture, expectList } = setup();
    expectList(false).flush([]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Nenhuma conta cadastrada');
  });

  it('falha ao carregar mostra o erro com nova tentativa', async () => {
    const { el, fixture, expectList } = setup();
    expectList(false).flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('erro inesperado');
    click(el, 'Tentar novamente');
    expectList(false).flush([]);
  });

  it('cartão sem os dias não é enviado; com conta e dias cria o cartão vinculado e recarrega', async () => {
    const { http, el, fixture, expectList } = setup();
    expectList(false).flush([itau]);
    fixture.detectChanges();

    click(el, 'Nova conta');
    fixture.detectChanges();
    type(el, '#name', 'Nubank');
    pickOption(fixture, 'Tipo', 'Cartão de crédito');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    http.expectNone({ method: 'POST', url: `${API}/accounts` });
    expect(el.textContent).toContain('Informe um dia entre 1 e 31.');

    (el.querySelector('[data-field="bankAccountId"] button[aria-haspopup]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (document.querySelector('[role="option"]') as HTMLElement).click();
    fixture.detectChanges();
    type(el, '#closingDay', '10');
    type(el, '#dueDay', '17');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const post = http.expectOne({ method: 'POST', url: `${API}/accounts` });
    expect(post.request.body).toEqual({ name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, bankAccountId: 7 });
    post.flush({ ...nubank }, { status: 201, statusText: 'Created' });
    expectList(false).flush([itau, nubank]);
  });

  it('cadastrar mostra uma confirmação e inativar oferece Desfazer', async () => {
    const { http, el, fixture, expectList } = setup();
    const notices = TestBed.inject(NoticeService);
    expectList(false).flush([carteira]);
    fixture.detectChanges();

    click(el, 'Inativar');
    http.expectOne({ method: 'PUT', url: `${API}/accounts/2` }).flush({ ...carteira, active: false, version: 4 });
    expectList(false).flush([]);
    const [toast] = notices.toasts();
    expect(toast.message).toBe('Conta inativada.');

    notices.runUndo(toast.id);
    const put = http.expectOne({ method: 'PUT', url: `${API}/accounts/2` });
    expect(put.request.body).toMatchObject({ active: true, version: 4 });
    put.flush({ ...carteira, version: 5 });
    expectList(false).flush([carteira]);
  });

  it('inativar envia a versão atual e recarrega a lista', async () => {
    const { http, el, fixture, expectList } = setup();
    expectList(false).flush([carteira]);
    fixture.detectChanges();

    click(el, 'Inativar');
    const put = http.expectOne({ method: 'PUT', url: `${API}/accounts/2` });
    expect(put.request.body).toMatchObject({ active: false, version: 3, name: 'Carteira', type: 'CASH', icon: 'cash' });
    put.flush({ ...carteira, active: false, version: 4 });
    expectList(false).flush([]);
  });

  it('inativar repassa a cor da conta no PUT (e conta sem cor não envia o campo)', async () => {
    const { http, el, fixture, expectList } = setup();
    expectList(false).flush([{ ...carteira, colorHex: '#16A34A' }]);
    fixture.detectChanges();
    click(el, 'Inativar');
    const put = http.expectOne({ method: 'PUT', url: `${API}/accounts/2` });
    expect(put.request.body).toMatchObject({ active: false, version: 3, colorHex: '#16A34A' });
    put.flush({ ...carteira, colorHex: '#16A34A', active: false, version: 4 });
    expectList(false).flush([]);
  });

  it('inativar conta sem cor (ou de cópia local antiga) não envia colorHex', async () => {
    const { http, el, fixture, expectList } = setup();
    expectList(false).flush([carteira]);
    fixture.detectChanges();
    click(el, 'Inativar');
    const put = http.expectOne({ method: 'PUT', url: `${API}/accounts/2` });
    expect(put.request.body).not.toHaveProperty('colorHex');
    put.flush({ ...carteira, active: false, version: 4 });
    expectList(false).flush([]);
  });

  describe('excluir conta (confirmação e guarda de integridade)', () => {
    const free = { canDelete: true, transactionCount: 0, invoicePaymentCount: 0, linkedCards: [], openingBalance: '0.00' };
    const used = { canDelete: false, transactionCount: 12, invoicePaymentCount: 2, linkedCards: [{ id: 1, name: 'Nubank' }], openingBalance: '0.00' };
    const dialog = (el: HTMLElement) => el.querySelector('[role="alertdialog"]') as HTMLElement | null;
    const confirmButton = (el: HTMLElement) => el.querySelector('[data-testid="confirm-confirm"]') as HTMLButtonElement;

    async function open(prepared: object) {
      const ctx = setup();
      ctx.expectList(false).flush([nubank]);
      ctx.fixture.detectChanges();
      click(ctx.el, 'Excluir');
      ctx.http.expectOne({ method: 'GET', url: `${API}/accounts/1/usage` }).flush(prepared);
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('Excluir só consulta o uso e abre a confirmação: nada é excluído antes de confirmar', async () => {
      const { http, el, fixture } = await open(free);
      http.expectNone({ method: 'DELETE', url: `${API}/accounts/1` });
      const box = dialog(el) as HTMLElement;
      expect(box.textContent).toContain('A conta "Nubank" será excluída definitivamente. Esta ação não pode ser desfeita.');
      expect(confirmButton(el).textContent?.trim()).toBe('Excluir conta "Nubank"');
      expect(document.activeElement).toBe(el.querySelector('[data-testid="confirm-cancel"]'));

      (el.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(dialog(el)).toBeNull();
      http.expectNone({ method: 'DELETE', url: `${API}/accounts/1` });
    });

    it('Escape cancela sem excluir', async () => {
      const { http, el, fixture } = await open(free);
      (dialog(el) as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(dialog(el)).toBeNull();
      http.expectNone({ method: 'DELETE', url: `${API}/accounts/1` });
    });

    it('confirmar exclui, fecha, recarrega a lista e avisa; o duplo toque envia uma só exclusão', async () => {
      const { http, el, fixture, expectList } = await open(free);
      const notices = TestBed.inject(NoticeService);
      confirmButton(el).click();
      fixture.detectChanges();
      expect(confirmButton(el).disabled).toBe(true);
      expect(confirmButton(el).textContent?.trim()).toBe('Excluindo…');
      confirmButton(el).click();
      http.expectOne({ method: 'DELETE', url: `${API}/accounts/1` }).flush(null, { status: 204, statusText: 'No Content' });
      expectList(false).flush([]);
      fixture.detectChanges();

      expect(dialog(el)).toBeNull();
      expect(notices.toasts()[0].message).toBe('Conta excluída.');
    });

    it('conta com dados mostra o bloqueio composto e oferece Inativar conta em vez de excluir', async () => {
      const { http, el, fixture, expectList } = await open(used);
      const text = dialog(el)?.textContent ?? '';
      expect(text).toContain(
        'A conta "Nubank" não pode ser excluída: possui 12 lançamentos, 2 pagamentos de fatura e cartão vinculado (Nubank). Inative a conta para preservar o histórico.',
      );
      expect(confirmButton(el)).toBeNull();
      expect(el.querySelector('[data-testid="confirm-cancel"]')?.textContent?.trim()).toBe('Fechar');

      (el.querySelector('[data-testid="confirm-inactivate"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(dialog(el)).toBeNull();
      http.expectNone({ method: 'DELETE', url: `${API}/accounts/1` });
      // banco ou cartão sem cartões vinculados inativa direto
      http.expectOne({ method: 'PUT', url: `${API}/accounts/1` }).flush({ ...nubank, active: false, version: 1 });
      expectList(false).flush([]);
    });

    it('conta inativa bloqueada não oferece Inativar conta', async () => {
      const ctx = setup();
      ctx.expectList(false).flush([{ ...nubank, active: false }]);
      ctx.fixture.detectChanges();
      click(ctx.el, 'Excluir');
      ctx.http.expectOne({ method: 'GET', url: `${API}/accounts/1/usage` }).flush(used);
      ctx.fixture.detectChanges();
      expect(ctx.el.querySelector('[data-testid="confirm-blocked"]')).not.toBeNull();
      expect(ctx.el.querySelector('[data-testid="confirm-inactivate"]')).toBeNull();
    });

    it('saldo inicial diferente de zero orienta a zerá-lo', async () => {
      const { el } = await open({ ...free, canDelete: false, openingBalance: '500.00' });
      expect(dialog(el)?.textContent).toContain('possui saldo inicial de R$ 500,00. Zere o saldo inicial para poder excluir.');
    });

    it('409 ao confirmar mantém o diálogo aberto e atualiza a prévia com o bloqueio atual', async () => {
      const { http, el, fixture } = await open(free);
      confirmButton(el).click();
      http
        .expectOne({ method: 'DELETE', url: `${API}/accounts/1` })
        .flush({ code: 'ACCOUNT_IN_USE', detail: 'Esta conta passou a ter lançamentos.' }, { status: 409, statusText: 'Conflict' });
      http.expectOne({ method: 'GET', url: `${API}/accounts/1/usage` }).flush(used);
      fixture.detectChanges();

      expect(dialog(el)).not.toBeNull();
      expect(el.querySelector('[data-testid="confirm-blocked"]')?.textContent).toContain('possui 12 lançamentos');
      expect(confirmButton(el)).toBeNull();
    });

    it('409 com a prévia ainda livre mostra a mensagem do servidor dentro do diálogo', async () => {
      const { http, el, fixture } = await open(free);
      confirmButton(el).click();
      http
        .expectOne({ method: 'DELETE', url: `${API}/accounts/1` })
        .flush({ code: 'ACCOUNT_IN_USE', detail: 'Esta conta passou a ter lançamentos.' }, { status: 409, statusText: 'Conflict' });
      http.expectOne({ method: 'GET', url: `${API}/accounts/1/usage` }).flush(free);
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="confirm-error"]')?.textContent).toContain('passou a ter lançamentos');
      expect(confirmButton(el)).not.toBeNull();
    });

    it('404 ao excluir trata como já excluída e recarrega', async () => {
      const { http, el, fixture, expectList } = await open(free);
      confirmButton(el).click();
      http.expectOne({ method: 'DELETE', url: `${API}/accounts/1` }).flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
      expectList(false).flush([]);
      fixture.detectChanges();
      expect(dialog(el)).toBeNull();
    });

    it('outro erro aparece dentro do diálogo, que continua aberto', async () => {
      const { http, el, fixture } = await open(free);
      confirmButton(el).click();
      http.expectOne({ method: 'DELETE', url: `${API}/accounts/1` }).flush({}, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(dialog(el)).not.toBeNull();
      expect(el.querySelector('[data-testid="confirm-error"]')?.textContent).toContain('erro inesperado');
    });

    it('falha ao consultar o uso mostra o erro na tela e não abre o diálogo', async () => {
      const { http, el, fixture, expectList } = setup();
      expectList(false).flush([nubank]);
      fixture.detectChanges();
      click(el, 'Excluir');
      http.expectOne({ method: 'GET', url: `${API}/accounts/1/usage` }).flush({}, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(dialog(el)).toBeNull();
      expect(el.querySelector('[role="alert"]')?.textContent).toContain('erro inesperado');
    });
  });

  it('mostrar inativas pede a lista completa', async () => {
    const { el, fixture, expectList } = setup();
    expectList(false).flush([nubank]);
    fixture.detectChanges();

    const checkbox = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expectList(true).flush([nubank, { ...carteira, active: false }]);
    fixture.detectChanges();

    expect(el.textContent).toContain('Inativa');
  });

  it('Nova conta abre um modal (e não um bloco entre os controles da lista)', async () => {
    const { el, fixture, expectList } = setup();
    expectList(false).flush([itau, inter]);
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')).toBeNull();

    click(el, 'Nova conta');
    fixture.detectChanges();
    const dialog = el.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-label')).toBe('Nova conta');
    expect(dialog.querySelector('form')).not.toBeNull();
    // o formulário não fica entre o interruptor/filtros e a lista
    expect(el.querySelector('section > gef-account-form')).toBeNull();

    (dialog.querySelector('button[aria-label="Fechar"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('editar abre o modal com o título Editar conta', async () => {
    const { el, fixture, expectList } = setup();
    expectList(false).flush([carteira]);
    fixture.detectChanges();
    click(el, 'Editar');
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Editar conta');
  });

  it('mostra ícone, selo PF/PJ e a conta vinculada do cartão', async () => {
    const { el, fixture, expectList } = setup();
    expectList(false).flush([itau, inter, nubank, carteira]);
    fixture.detectChanges();

    const holders = Array.from(el.querySelectorAll('[data-holder]')).map((h) => h.textContent?.trim());
    expect(holders).toEqual(expect.arrayContaining(['PF', 'PJ']));
    expect(el.querySelectorAll('tbody gef-account-badge svg').length).toBe(4);
    const row = Array.from(el.querySelectorAll('tbody tr')).find((r) => r.textContent?.includes('Nubank'))!;
    expect(row.textContent).toContain('Itaú pessoal');
  });

  it('filtra por pessoa física, pessoa jurídica ou todas', async () => {
    const { el, fixture, expectList } = setup();
    expectList(false).flush([itau, inter, nubank]);
    fixture.detectChanges();

    const choose = (label: string) => {
      const radio = Array.from(el.querySelectorAll<HTMLInputElement>('[data-field="holderFilter"] input')).find((i) =>
        i.closest('label')?.textContent?.includes(label),
      )!;
      radio.click();
      fixture.detectChanges();
    };
    const names = () => Array.from(el.querySelectorAll('tbody [data-name]')).map((n) => n.textContent?.trim());

    choose('Pessoa jurídica');
    expect(names()).toEqual(['Inter empresa']);
    choose('Pessoa física');
    expect(names()).toEqual(['Itaú pessoal', 'Nubank']);
    choose('Todas');
    expect(names()).toHaveLength(3);
  });

  it('esconde o filtro quando só existe um tipo de titular', async () => {
    const { el, fixture, expectList } = setup();
    expectList(false).flush([itau, carteira]);
    fixture.detectChanges();
    expect(el.querySelector('[data-field="holderFilter"]')).toBeNull();
  });

  it('cartão antigo sem conta aparece com o aviso para vincular', async () => {
    const { el, fixture, expectList } = setup();
    expectList(false).flush([itau, antigo]);
    fixture.detectChanges();
    expect(el.textContent).toContain('vincule a uma conta bancária');
  });

  it('inativar conta com cartões vinculados avisa quais são e só inativa depois de confirmar', async () => {
    const { http, el, fixture, expectList } = setup();
    expectList(false).flush([itau, nubank]);
    fixture.detectChanges();

    (Array.from(el.querySelectorAll('tbody tr')).find((r) => r.textContent?.includes('Itaú pessoal'))!
      .querySelectorAll('button')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectNone({ method: 'PUT', url: `${API}/accounts/7` });
    expect(document.body.textContent).toContain('Nubank');
    expect(document.body.textContent).toContain('cartão vinculado');

    (Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Inativar mesmo assim') as HTMLButtonElement).click();
    const put = http.expectOne({ method: 'PUT', url: `${API}/accounts/7` });
    expect(put.request.body).toMatchObject({ active: false, holderType: 'PF', version: 1 });
    put.flush({ ...itau, active: false, version: 2 });
    expectList(false).flush([nubank]);
  });

  it('o atalho "Cadastrar conta bancária" do formulário de cartão abre uma nova conta bancária', async () => {
    const { el, fixture, expectList } = setup();
    expectList(false).flush([]);
    fixture.detectChanges();
    click(el, 'Nova conta');
    fixture.detectChanges();
    pickOption(fixture, 'Tipo', 'Cartão de crédito');
    click(el, 'Cadastrar conta bancária');
    fixture.detectChanges();
    expect(selectTrigger(el, 'Tipo').textContent).toContain('Conta bancária');
    expect(el.querySelector('#holder-PF')).not.toBeNull();
  });

  describe('no celular (layout compacto)', () => {
    it('mostra cartões em vez de tabela, com os dados do cartão e ações acessíveis', async () => {
      const { el, fixture, expectList } = setup(true);
      expectList(false).flush([nubank, carteira]);
      fixture.detectChanges();

      expect(el.querySelector('table')).toBeNull();
      const cards = el.querySelectorAll('[data-testid="account-card"]');
      expect(cards).toHaveLength(2);
      expect(cards[0].textContent).toContain('Nubank');
      expect(cards[0].textContent).toContain('Cartão de crédito');
      expect(cards[0].textContent).toContain('Fecha dia 10');
      expect(cards[0].querySelector('svg')).not.toBeNull();
      expect(cards[0].textContent).toContain('vence dia 17');
      expect(cards[1].textContent).toContain('Dinheiro');
      for (const label of ['Editar Nubank', 'Inativar Nubank', 'Excluir Nubank', 'Editar Carteira']) {
        expect(el.querySelector(`button[aria-label="${label}"]`)).not.toBeNull();
      }
    });

    it('as ações do cartão funcionam como na tabela (inativar envia a versão)', async () => {
      const { http, el, fixture, expectList } = setup(true);
      expectList(false).flush([carteira]);
      fixture.detectChanges();

      (el.querySelector('button[aria-label="Inativar Carteira"]') as HTMLButtonElement).click();
      const put = http.expectOne({ method: 'PUT', url: `${API}/accounts/2` });
      expect(put.request.body).toMatchObject({ active: false, version: 3 });
      put.flush({ ...carteira, active: false, version: 4 });
      expectList(false).flush([]);
    });
  });

  it('no desktop continua com a tabela', async () => {
    const { el, fixture, expectList } = setup(false);
    expectList(false).flush([nubank]);
    fixture.detectChanges();

    expect(el.querySelector('table')).not.toBeNull();
    expect(el.querySelector('[data-testid="account-card"]')).toBeNull();
  });

  it('ao editar um cartão avisa que só as ocorrências fixas pendentes e futuras são recalculadas (FR-006)', async () => {
    const { el, fixture, expectList } = setup();
    expectList(false).flush([nubank]);
    fixture.detectChanges();

    click(el, 'Editar');
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="card-days-notice"]')?.textContent).toContain('lançamentos fixos pendentes');
    expect(el.querySelector('[data-testid="card-days-notice"]')?.textContent).toContain('vencimento futuro');
  });

  describe('saldo atual por conta', () => {
    const balanceCells = (el: HTMLElement) => Array.from(el.querySelectorAll('[data-testid="account-balance"]'));

    it('mostra o saldo das contas bancárias e de dinheiro, com sinal e cor no negativo, e traço no cartão (tabela)', () => {
      const { el, fixture, expectList, expectBalances } = setup();
      expectList(false).flush([itau, nubank, carteira]);
      expectBalances().flush(withBalances);
      fixture.detectChanges();

      const cells = balanceCells(el);
      expect(cells).toHaveLength(3);
      expect(cells[0].textContent).toContain('R$ 1.500,00');
      expect(cells[0].querySelector('.financial-value')?.className).toContain('text-gefinc-primary');
      expect(cells[1].textContent?.trim()).toBe('—');
      expect(cells[2].textContent).toContain('-R$ 200,00');
      expect(cells[2].querySelector('.financial-value')?.className).toContain('text-gefinc-danger');
      expect(cells[2].querySelector('svg')).not.toBeNull();
    });

    it('no celular cada conta tem o saldo atual no cartão; o cartão de crédito não mostra saldo', () => {
      const { el, fixture, expectList, expectBalances } = setup(true);
      expectList(false).flush([itau, nubank, carteira]);
      expectBalances().flush(withBalances);
      fixture.detectChanges();

      const cards = Array.from(el.querySelectorAll('[data-testid="account-card"]'));
      expect(cards[0].textContent).toContain('Saldo atual');
      expect(cards[0].textContent).toContain('R$ 1.500,00');
      expect(cards[1].textContent).not.toContain('Saldo atual');
      expect(cards[2].textContent).toContain('-R$ 200,00');
    });

    it('a lista de contas aparece antes dos saldos chegarem', () => {
      const { el, fixture, expectList, expectBalances } = setup();
      expectList(false).flush([itau]);
      fixture.detectChanges();
      expect(el.textContent).toContain('Itaú pessoal');
      expect(el.querySelector('[data-testid="balance-pending"]')?.textContent).toContain('Carregando');

      expectBalances().flush(withBalances);
      fixture.detectChanges();
      expect(el.textContent).toContain('R$ 1.500,00');
    });

    it('falha nos saldos não bloqueia a lista: mostra aviso com nova tentativa e traços', () => {
      const { el, fixture, expectList, expectBalances, http } = setup();
      expectList(false).flush([itau]);
      expectBalances().flush({}, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(el.textContent).toContain('Itaú pessoal');
      expect(el.querySelector('[data-testid="balances-error"]')?.textContent).toContain('Não foi possível carregar os saldos');
      expect(balanceCells(el)[0].textContent?.trim()).toBe('—');

      (el.querySelector('[data-testid="balances-error"] button') as HTMLButtonElement).click();
      http.expectOne((r) => r.url === `${API}/balances`).flush(withBalances);
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="balances-error"]')).toBeNull();
      expect(balanceCells(el)[0].textContent).toContain('R$ 1.500,00');
    });

    it('falha na lista não impede a carga dos saldos, que seguem independentes', () => {
      const { el, fixture, expectList, expectBalances } = setup();
      expectList(false).flush({}, { status: 500, statusText: 'Server Error' });
      expectBalances().flush(withBalances);
      fixture.detectChanges();
      expect(el.textContent).toContain('erro inesperado');
      expect(el.querySelector('[data-testid="balances-error"]')).toBeNull();
    });

    it('conta inativa com saldo diferente de zero mostra o saldo real e o botão Reativar', () => {
      const { el, fixture, expectList, expectBalances } = setup();
      expectList(false).flush([itau]);
      expectBalances().flush(withBalances);
      fixture.detectChanges();

      const checkbox = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
      expectList(true).flush([itau, { ...carteira, active: false }]);
      expectBalances().flush({
        ...withBalances,
        total: '1500.00',
        accounts: [
          withBalances.accounts[0],
          { accountId: 2, name: 'Carteira', type: 'CASH', active: false, balance: '300.00', openingBalance: '0.00' },
        ],
      });
      fixture.detectChanges();

      expect(balanceCells(el).map((c) => c.textContent)).toEqual([expect.stringContaining('R$ 1.500,00'), expect.stringContaining('R$ 300,00')]);
      expect(Array.from(el.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Reativar')).toBe(true);
    });

    it('conta inativa sem saldo na resposta mostra R$ 0,00', () => {
      const { el, fixture, expectList, expectBalances } = setup();
      expectList(false).flush([{ ...carteira, active: false }]);
      expectBalances().flush(noBalances);
      fixture.detectChanges();
      expect(balanceCells(el)[0].textContent).toContain('R$ 0,00');
    });
  });

  describe('transferir entre contas', () => {
    const button = (el: HTMLElement) => el.querySelector('[data-testid="transfer-button"]') as HTMLButtonElement;
    const dialog = () => document.querySelector('[role="dialog"][aria-label="Nova transferência"]');
    const balancesFor = {
      asOf: '2026-11-10',
      total: '1300.00',
      accounts: [
        { accountId: 7, name: 'Itaú pessoal', type: 'CHECKING', active: true, balance: '1500.00', openingBalance: '0.00' },
        { accountId: 2, name: 'Carteira', type: 'CASH', active: true, balance: '-200.00', openingBalance: '0.00' },
      ],
      unlinkedCardPayments: '0.00',
    };

    it('com duas ou mais contas elegíveis ativas o botão Transferir fica habilitado e não mostra a dica', () => {
      const { el, fixture, expectList } = setup();
      expectList(false).flush([itau, carteira, nubank]);
      fixture.detectChanges();

      expect(button(el).disabled).toBe(false);
      expect(button(el).getAttribute('aria-describedby')).toBeNull();
      expect(el.querySelector('[data-testid="transfer-hint"]')).toBeNull();
    });

    it.each([
      ['nenhuma conta', []],
      ['uma só conta elegível', [itau, nubank]],
      ['só cartões e uma conta elegível', [carteira, nubank, antigo]],
      ['uma ativa e outra inativa', [itau, { ...carteira, active: false }]],
    ])('com %s o botão fica desabilitado e a dica explica o motivo', (_name, accounts) => {
      const { el, fixture, expectList } = setup();
      expectList(false).flush(accounts);
      fixture.detectChanges();

      expect(button(el).disabled).toBe(true);
      expect(button(el).getAttribute('aria-describedby')).toBe('transfer-hint');
      expect(el.querySelector('#transfer-hint')?.textContent).toContain('pelo menos duas contas bancárias ou de dinheiro ativas');
    });

    it('Transferir abre o formulário sem origem escolhida; registrar recarrega contas e saldos e avisa', () => {
      const { http, el, fixture, expectList, expectBalances } = setup();
      const notices = TestBed.inject(NoticeService);
      expectList(false).flush([itau, carteira]);
      expectBalances().flush(withBalances);
      fixture.detectChanges();

      button(el).click();
      fixture.detectChanges();
      http.expectOne({ method: 'GET', url: `${API}/balances` }).flush(balancesFor);
      fixture.detectChanges();
      expect(dialog()).not.toBeNull();
      expect(document.querySelector('[data-field="fromAccountId"]')?.textContent).toContain('Escolha a conta de origem');

      (document.querySelector('[data-field="fromAccountId"] button[aria-haspopup]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (document.querySelector('[role="option"][data-account-id="7"]') as HTMLElement).click();
      fixture.detectChanges();
      (document.querySelector('[data-field="toAccountId"] button[aria-haspopup]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (document.querySelector('[role="option"][data-account-id="2"]') as HTMLElement).click();
      fixture.detectChanges();
      type(document.body, 'gef-money-input input', '5000');
      (document.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      http
        .expectOne({ method: 'POST', url: `${API}/transfers` })
        .flush({ id: 1, fromAccountId: 7, toAccountId: 2, amount: '50.00', transferDate: '2026-11-10', scheduled: false, version: 0 }, { status: 201, statusText: 'Created' });
      fixture.detectChanges();

      expect(dialog()).toBeNull();
      expect(notices.toasts()[0].message).toBe('Transferência registrada.');
      expectList(false).flush([itau, carteira]);
      expectBalances().flush(withBalances);
    });

    it('a ação Transferir de uma conta abre o formulário com ela como origem', () => {
      const { http, el, fixture, expectList, expectBalances } = setup();
      expectList(false).flush([itau, carteira, nubank]);
      expectBalances().flush(withBalances);
      fixture.detectChanges();

      const row = (name: string) => Array.from(el.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes(name)) as HTMLElement;
      (row('Carteira').querySelector('[data-testid="account-transfer"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      http.expectOne({ method: 'GET', url: `${API}/balances` }).flush(balancesFor);
      fixture.detectChanges();

      expect(document.querySelector('[data-field="fromAccountId"]')?.textContent).toContain('Carteira');
    });

    it('cartão de crédito e conta inativa não têm a ação Transferir; as demais têm', () => {
      const { el, fixture, expectList } = setup();
      expectList(false).flush([itau, carteira, nubank, { ...inter, active: false }]);
      fixture.detectChanges();

      const rows = Array.from(el.querySelectorAll('tbody tr'));
      const has = (name: string) => rows.find((tr) => tr.textContent?.includes(name))?.querySelector('[data-testid="account-transfer"]') != null;
      expect(has('Itaú pessoal')).toBe(true);
      expect(has('Carteira')).toBe(true);
      expect(has('Nubank')).toBe(false);
      expect(has('Inter empresa')).toBe(false);
    });

    it('no celular a ação também aparece nos cartões das contas elegíveis', () => {
      const { el, fixture, expectList } = setup(true);
      expectList(false).flush([itau, carteira, nubank]);
      fixture.detectChanges();

      const cards = Array.from(el.querySelectorAll('[data-testid="account-card"]'));
      expect(cards.map((c) => c.querySelector('[data-testid="account-transfer"]') != null)).toEqual([true, true, false]);
      expect(cards[0].querySelector('[data-testid="account-transfer"]')?.getAttribute('aria-label')).toBe('Transferir de Itaú pessoal');
    });
  });
});
