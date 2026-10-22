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
});
