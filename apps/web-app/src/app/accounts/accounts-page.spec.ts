import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  API_BASE_URL,
  CLIENT_KIND,
  MemoryTokenStore,
  TokenStore,
  authInterceptor,
} from '@gefinc/ui-shared';
import { AccountsPage } from './accounts-page';

const API = '/api/v1';
const nubank = { id: 1, name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, active: true, version: 0 };
const carteira = { id: 2, name: 'Carteira', type: 'CASH', active: true, version: 3 };

function setup() {
  TestBed.configureTestingModule({
    providers: [
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

  it('cartão sem os dias não é enviado; com os dias cria a conta e recarrega', async () => {
    const { http, el, fixture, expectList } = setup();
    expectList(false).flush([]);
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

    type(el, '#closingDay', '10');
    type(el, '#dueDay', '17');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const post = http.expectOne({ method: 'POST', url: `${API}/accounts` });
    expect(post.request.body).toEqual({ name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17 });
    post.flush({ ...nubank }, { status: 201, statusText: 'Created' });
    expectList(false).flush([nubank]);
  });

  it('inativar envia a versão atual e recarrega a lista', async () => {
    const { http, el, fixture, expectList } = setup();
    expectList(false).flush([carteira]);
    fixture.detectChanges();

    click(el, 'Inativar');
    const put = http.expectOne({ method: 'PUT', url: `${API}/accounts/2` });
    expect(put.request.body).toMatchObject({ active: false, version: 3, name: 'Carteira', type: 'CASH' });
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
});
