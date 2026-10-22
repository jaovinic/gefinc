import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL, CLIENT_KIND, MemoryTokenStore, NoticeService, TokenStore, authInterceptor } from '../api';
import { Viewport } from '../viewport/viewport';
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
  return { http, fixture, el: fixture.nativeElement as HTMLElement, expectList };
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
  afterEach(() => TestBed.inject(HttpTestingController).verify());

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
    const select = el.querySelector('#type') as HTMLSelectElement;
    select.value = 'CREDIT_CARD';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
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

  it('excluir conta com lançamentos mostra a orientação do servidor', async () => {
    const { http, el, fixture, expectList } = setup();
    expectList(false).flush([nubank]);
    fixture.detectChanges();

    click(el, 'Excluir');
    http
      .expectOne({ method: 'DELETE', url: `${API}/accounts/1` })
      .flush(
        { code: 'ACCOUNT_IN_USE', detail: 'Esta conta possui lançamentos. Inative a conta para preservar o histórico.' },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Inative a conta');
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
    const select = el.querySelector('#type') as HTMLSelectElement;
    select.value = 'CREDIT_CARD';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    click(el, 'Cadastrar conta bancária');
    fixture.detectChanges();
    expect((el.querySelector('#type') as HTMLSelectElement).value).toBe('CHECKING');
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
});
