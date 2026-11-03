import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Account } from '@gefinc/core-models';
import { API_BASE_URL, CLIENT_KIND, MemoryTokenStore, TokenStore, authInterceptor } from '../api';
import { AccountForm } from './account-form';

const API = '/api/v1';
const itau = { id: 1, name: 'Itaú', type: 'CHECKING', holderType: 'PF', icon: 'bank', active: true, version: 0 } as Account;
const inter = { id: 2, name: 'Inter empresa', type: 'CHECKING', holderType: 'PJ', icon: 'building', active: true, version: 1 } as Account;
const legacyCard = { id: 5, name: 'Antigo', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, icon: 'card', active: true, version: 2 } as Account;

@Component({
  imports: [AccountForm],
  template: `<gef-account-form [account]="account()" [banks]="banks()" (saved)="saved()" (newBankRequested)="newBank()" />`,
})
class Host {
  readonly account = signal<Account | null>(null);
  readonly banks = signal<Account[]>([itau, inter]);
  readonly saved = jest.fn();
  readonly newBank = jest.fn();
}

function setup(configure: (host: Host) => void = () => undefined) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: API },
      { provide: CLIENT_KIND, useValue: 'web' },
      { provide: TokenStore, useClass: MemoryTokenStore },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  configure(fixture.componentInstance);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const http = TestBed.inject(HttpTestingController);
  const type = (selector: string, value: string) => {
    const input = el.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const selectType = (value: string) => {
    const select = el.querySelector('#type') as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const submit = () => {
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  const holder = (value: 'PF' | 'PJ') => {
    (el.querySelector(`#holder-${value}`) as HTMLInputElement).click();
    fixture.detectChanges();
  };
  const pickIcon = (key: string) => {
    (el.querySelector(`[data-icon="${key}"]`) as HTMLElement).click();
    fixture.detectChanges();
  };
  const pickBank = (name: string) => {
    (el.querySelector('[data-field="bankAccountId"] button[aria-haspopup]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((o) => o.textContent?.includes(name))!;
    option.click();
    fixture.detectChanges();
  };
  return { fixture, host: fixture.componentInstance, el, http, type, selectType, submit, holder, pickIcon, pickBank };
}

describe('AccountForm', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('conta bancária sem titular não é enviada, avisa e mantém o digitado', () => {
    const { http, el, type, submit } = setup();
    type('#name', 'Itaú pessoal');
    submit();
    http.expectNone({ method: 'POST', url: `${API}/accounts` });
    expect(el.textContent).toContain('Escolha pessoa física ou jurídica.');
    expect((el.querySelector('#name') as HTMLInputElement).value).toBe('Itaú pessoal');
  });

  it('cria conta bancária pessoa física com o ícone escolhido', () => {
    const { http, host, type, submit, holder, pickIcon } = setup();
    type('#name', 'Itaú pessoal');
    holder('PF');
    pickIcon('landmark');
    submit();
    const post = http.expectOne({ method: 'POST', url: `${API}/accounts` });
    expect(post.request.body).toEqual({ name: 'Itaú pessoal', type: 'CHECKING', holderType: 'PF', icon: 'landmark' });
    post.flush({ ...itau }, { status: 201, statusText: 'Created' });
    expect(host.saved).toHaveBeenCalled();
  });

  it('sem ícone escolhido não envia o campo (o servidor usa o padrão do tipo)', () => {
    const { http, type, submit, holder } = setup();
    type('#name', 'Inter empresa');
    holder('PJ');
    submit();
    const post = http.expectOne({ method: 'POST', url: `${API}/accounts` });
    expect(post.request.body).toEqual({ name: 'Inter empresa', type: 'CHECKING', holderType: 'PJ' });
    post.flush({ ...inter }, { status: 201, statusText: 'Created' });
  });

  it('dinheiro não pede titular nem vínculo', () => {
    const { http, el, type, selectType, submit } = setup();
    selectType('CASH');
    expect(el.querySelector('#holder-PF')).toBeNull();
    expect(el.querySelector('[data-field="bankAccountId"]')).toBeNull();
    type('#name', 'Carteira');
    submit();
    const post = http.expectOne({ method: 'POST', url: `${API}/accounts` });
    expect(post.request.body).toEqual({ name: 'Carteira', type: 'CASH' });
    post.flush({ id: 9, name: 'Carteira', type: 'CASH', active: true, version: 0 }, { status: 201, statusText: 'Created' });
  });

  it('cartão sem conta bancária não é enviado e avisa', () => {
    const { http, el, type, selectType, submit } = setup();
    selectType('CREDIT_CARD');
    type('#name', 'Nubank');
    type('#closingDay', '10');
    type('#dueDay', '17');
    submit();
    http.expectNone({ method: 'POST', url: `${API}/accounts` });
    expect(el.textContent).toContain('Escolha a conta bancária do cartão.');
  });

  it('cartão não avisa dos campos ainda vazios só porque o nome perdeu o foco (o painel não pode crescer sob o clique)', () => {
    const { fixture, el, type, selectType, submit } = setup();
    selectType('CREDIT_CARD');
    type('#name', 'Nubank');
    (el.querySelector('#name') as HTMLInputElement).dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Escolha a conta bancária do cartão.');
    expect(el.textContent).not.toContain('Informe um dia entre 1 e 31.');
    submit();
    expect(el.textContent).toContain('Escolha a conta bancária do cartão.');
    expect(el.textContent).toContain('Informe um dia entre 1 e 31.');
  });

  it('cartão vinculado envia a conta, os dias e o ícone, e sugere o nome a partir do banco', () => {
    const { http, el, selectType, type, submit, pickBank, pickIcon } = setup();
    selectType('CREDIT_CARD');
    pickBank('Inter empresa');
    expect((el.querySelector('#name') as HTMLInputElement).value).toBe('Cartão Inter empresa');
    type('#name', 'Nubank Roxinho');
    pickIcon('card-gold');
    type('#closingDay', '10');
    type('#dueDay', '17');
    submit();
    const post = http.expectOne({ method: 'POST', url: `${API}/accounts` });
    expect(post.request.body).toEqual({
      name: 'Nubank Roxinho', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, bankAccountId: 2, icon: 'card-gold',
    });
    post.flush({ id: 7 }, { status: 201, statusText: 'Created' });
  });

  it('nome já digitado não é trocado pela sugestão', () => {
    const { el, selectType, type, pickBank } = setup();
    selectType('CREDIT_CARD');
    type('#name', 'Meu cartão');
    pickBank('Itaú');
    expect((el.querySelector('#name') as HTMLInputElement).value).toBe('Meu cartão');
  });

  it('sem conta bancária cadastrada orienta e oferece o atalho', () => {
    const { host, el, fixture, selectType } = setup((h) => h.banks.set([]));
    selectType('CREDIT_CARD');
    expect(el.textContent).toContain('Cadastre uma conta bancária antes de criar um cartão.');
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Cadastrar conta bancária')) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.newBank).toHaveBeenCalled();
  });

  it('cartão antigo mostra o aviso e exige o vínculo ao salvar', () => {
    const { http, el, submit, pickBank } = setup((h) => h.account.set(legacyCard));
    expect(el.textContent).toContain('vincule a uma conta bancária');
    submit();
    http.expectNone({ method: 'PUT', url: `${API}/accounts/5` });
    expect(el.textContent).toContain('Escolha a conta bancária do cartão.');
    pickBank('Itaú');
    submit();
    const put = http.expectOne({ method: 'PUT', url: `${API}/accounts/5` });
    expect(put.request.body).toMatchObject({ name: 'Antigo', type: 'CREDIT_CARD', bankAccountId: 1, active: true, version: 2 });
    put.flush({ ...legacyCard, bankAccountId: 1 });
  });

  it('edita o titular de PF para PJ mantendo versão e ícone', () => {
    const { http, holder, submit } = setup((h) => h.account.set(itau));
    holder('PJ');
    submit();
    const put = http.expectOne({ method: 'PUT', url: `${API}/accounts/1` });
    expect(put.request.body).toEqual({
      name: 'Itaú', type: 'CHECKING', holderType: 'PJ', icon: 'bank', active: true, version: 0,
    });
    put.flush({ ...itau, holderType: 'PJ' });
  });

  it('conta bancária e dinheiro oferecem o saldo inicial opcional; cartão não', () => {
    const { el, selectType } = setup();
    expect(el.querySelector('[data-field="openingBalance"]')?.textContent).toContain('Saldo inicial (opcional)');
    selectType('CASH');
    expect(el.querySelector('[data-field="openingBalance"]')).not.toBeNull();
    selectType('CREDIT_CARD');
    expect(el.querySelector('[data-field="openingBalance"]')).toBeNull();
  });

  it('envia o saldo inicial informado ao criar a conta', () => {
    const { http, el, type, submit, holder } = setup();
    type('#name', 'Itaú pessoal');
    holder('PF');
    type('[data-field="openingBalance"] input', '150050');
    expect((el.querySelector('[data-field="openingBalance"] input') as HTMLInputElement).value).toBe('1.500,50');
    submit();
    const post = http.expectOne({ method: 'POST', url: `${API}/accounts` });
    expect(post.request.body).toEqual({ name: 'Itaú pessoal', type: 'CHECKING', holderType: 'PF', openingBalance: '1500.50' });
    post.flush({ ...itau }, { status: 201, statusText: 'Created' });
  });

  it('sem saldo inicial informado não envia o campo; cartão nunca o envia', () => {
    const { http, type, selectType, submit, pickBank } = setup();
    selectType('CREDIT_CARD');
    pickBank('Itaú');
    type('#closingDay', '10');
    type('#dueDay', '17');
    submit();
    const post = http.expectOne({ method: 'POST', url: `${API}/accounts` });
    expect(post.request.body).not.toHaveProperty('openingBalance');
    post.flush({ id: 7 }, { status: 201, statusText: 'Created' });
  });

  it('ao editar mostra o saldo inicial atual e só o reenvia quando alterado', () => {
    const { http, el, type, submit } = setup((h) => h.account.set({ ...itau, openingBalance: '200.00' } as Account));
    expect((el.querySelector('[data-field="openingBalance"] input') as HTMLInputElement).value).toBe('200,00');
    submit();
    const first = http.expectOne({ method: 'PUT', url: `${API}/accounts/1` });
    expect(first.request.body).not.toHaveProperty('openingBalance');
    first.flush({ ...itau });

    type('[data-field="openingBalance"] input', '30000');
    submit();
    const second = http.expectOne({ method: 'PUT', url: `${API}/accounts/1` });
    expect(second.request.body.openingBalance).toBe('300.00');
    second.flush({ ...itau });
  });

  const sign = (el: HTMLElement, fixture: { detectChanges(): void }, value: 'POSITIVE' | 'NEGATIVE') => {
    (el.querySelector(`#opening-${value}`) as HTMLInputElement).click();
    fixture.detectChanges();
  };

  it('oferece a escolha Positivo (tenho) ou Negativo (devendo) com ícone, positivo por padrão', () => {
    const { el } = setup();
    const options = Array.from(el.querySelectorAll('[data-field="openingSign"] label'));
    expect(options.map((o) => o.textContent?.trim())).toEqual(['Positivo (tenho)', 'Negativo (devendo)']);
    expect(options.every((o) => o.querySelector('svg') !== null)).toBe(true);
    expect((el.querySelector('#opening-POSITIVE') as HTMLInputElement).checked).toBe(true);
    expect(el.querySelector('[data-testid="opening-help"]')?.textContent).not.toContain('cheque especial');
  });

  it('saldo inicial negativo: valor digitado sem sinal, escolha Negativo e envio com sinal', () => {
    const { http, el, type, submit, holder, fixture } = setup();
    type('#name', 'Conta devedora');
    holder('PF');
    type('[data-field="openingBalance"] input', '30000');
    sign(el, fixture, 'NEGATIVE');
    expect(el.querySelector('[data-testid="opening-help"]')?.textContent).toContain('já começa devendo');
    expect(el.querySelector('[data-field="openingBalance"] input')?.className).toContain('text-gefinc-danger');
    submit();
    const post = http.expectOne({ method: 'POST', url: `${API}/accounts` });
    expect(post.request.body.openingBalance).toBe('-300.00');
    post.flush({ ...itau }, { status: 201, statusText: 'Created' });
  });

  it('escolher Negativo sem valor não envia saldo; valor zero com Negativo envia 0.00, nunca -0.00', () => {
    const { http, el, type, submit, holder, fixture } = setup();
    type('#name', 'Conta');
    holder('PF');
    sign(el, fixture, 'NEGATIVE');
    submit();
    const first = http.expectOne({ method: 'POST', url: `${API}/accounts` });
    expect(first.request.body).not.toHaveProperty('openingBalance');
    first.flush({ ...itau }, { status: 201, statusText: 'Created' });

    type('[data-field="openingBalance"] input', '0');
    submit();
    const second = http.expectOne({ method: 'POST', url: `${API}/accounts` });
    expect(second.request.body.openingBalance).toBe('0.00');
    second.flush({ ...itau }, { status: 201, statusText: 'Created' });
  });

  it('abrir conta com saldo inicial negativo mostra o valor e o sentido corretos, sem reenviar sem mudança', () => {
    const { http, el, submit } = setup((h) => h.account.set({ ...itau, openingBalance: '-50.00' } as Account));
    expect((el.querySelector('[data-field="openingBalance"] input') as HTMLInputElement).value).toBe('50,00');
    expect((el.querySelector('#opening-NEGATIVE') as HTMLInputElement).checked).toBe(true);
    expect((el.querySelector('#opening-POSITIVE') as HTMLInputElement).checked).toBe(false);
    expect(el.querySelector('[data-testid="negative-opening"]')).toBeNull();
    submit();
    const put = http.expectOne({ method: 'PUT', url: `${API}/accounts/1` });
    expect(put.request.body).not.toHaveProperty('openingBalance');
    put.flush({ ...itau });
  });

  it('trocar o sentido de um saldo existente reenvia o valor com o novo sinal', () => {
    const { http, el, submit, fixture } = setup((h) => h.account.set({ ...itau, openingBalance: '-50.00' } as Account));
    sign(el, fixture, 'POSITIVE');
    submit();
    const put = http.expectOne({ method: 'PUT', url: `${API}/accounts/1` });
    expect(put.request.body.openingBalance).toBe('50.00');
    put.flush({ ...itau });
  });

  it('esvaziar o valor de uma conta negativa envia 0.00', () => {
    const { http, el, type, submit } = setup((h) => h.account.set({ ...itau, openingBalance: '-50.00' } as Account));
    type('[data-field="openingBalance"] input', '');
    expect((el.querySelector('#opening-NEGATIVE') as HTMLInputElement).checked).toBe(true);
    submit();
    const put = http.expectOne({ method: 'PUT', url: `${API}/accounts/1` });
    expect(put.request.body.openingBalance).toBe('0.00');
    put.flush({ ...itau });
  });

  it('mostra o erro do servidor no campo de saldo inicial', () => {
    const { http, el, type, submit, holder, fixture } = setup();
    type('#name', 'Itaú');
    holder('PF');
    type('[data-field="openingBalance"] input', '100');
    submit();
    http
      .expectOne({ method: 'POST', url: `${API}/accounts` })
      .flush({ status: 422, errors: [{ field: 'openingBalance', message: 'Saldo inicial inválido.' }] }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();
    expect(el.querySelector('[data-field="openingBalance"]')?.textContent).toContain('Saldo inicial inválido.');
  });
});
