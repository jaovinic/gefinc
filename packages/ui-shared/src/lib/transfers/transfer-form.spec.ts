import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Account, Transfer } from '@gefinc/core-models';
import { todayIso } from '@gefinc/utils';
import { API, configureHttpTesting, fillDate, type } from '../../testing/testbed';
import { TransferForm } from './transfer-form';

const itau = { id: 1, name: 'Itaú', type: 'CHECKING', holderType: 'PF', icon: 'bank', active: true, version: 0 } as Account;
const carteira = { id: 2, name: 'Carteira', type: 'CASH', icon: 'cash', active: true, version: 0 } as Account;
const inter = { id: 3, name: 'Inter', type: 'CHECKING', holderType: 'PJ', icon: 'building', active: true, version: 0 } as Account;
const nubank = { id: 4, name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, bankAccountId: 1, active: true, version: 0 } as Account;
const velha = { id: 5, name: 'Conta velha', type: 'CHECKING', holderType: 'PF', icon: 'bank', active: false, version: 0 } as Account;
const accounts = [itau, carteira, inter, nubank, velha];

const balances = {
  asOf: '2026-11-10',
  total: '1100.00',
  accounts: [
    { accountId: 1, name: 'Itaú', type: 'CHECKING', active: true, balance: '1000.00', openingBalance: '0.00' },
    { accountId: 2, name: 'Carteira', type: 'CASH', active: true, balance: '50.00', openingBalance: '0.00' },
    { accountId: 3, name: 'Inter', type: 'CHECKING', active: true, balance: '50.00', openingBalance: '0.00' },
  ],
  unlinkedCardPayments: '0.00',
};
const created: Transfer = { id: 9, fromAccountId: 1, toAccountId: 2, amount: '100.00', transferDate: todayIso(), scheduled: false, version: 0 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function setup(inputs: { transfer?: Transfer | null; initialFromId?: number | null; accounts?: Account[] } = {}, flushBalances: unknown = balances) {
  const { http } = configureHttpTesting();
  const fixture = TestBed.createComponent(TransferForm);
  fixture.componentRef.setInput('accounts', inputs.accounts ?? accounts);
  if (inputs.transfer !== undefined) fixture.componentRef.setInput('transfer', inputs.transfer);
  if (inputs.initialFromId !== undefined) fixture.componentRef.setInput('initialFromId', inputs.initialFromId);
  const saved = jest.fn();
  const cancelled = jest.fn();
  fixture.componentInstance.saved.subscribe(saved);
  fixture.componentInstance.cancelled.subscribe(cancelled);
  fixture.detectChanges();
  const balancesRequest = http.expectOne({ method: 'GET', url: `${API}/balances` });
  if (flushBalances === null) {
    balancesRequest.error(new ProgressEvent('error'), { status: 0 });
  } else {
    balancesRequest.flush(flushBalances);
  }
  fixture.detectChanges();
  return { http, fixture, el: fixture.nativeElement as HTMLElement, saved, cancelled };
}

const field = (el: HTMLElement, name: string) => el.querySelector(`[data-field="${name}"]`) as HTMLElement;

/** Escolhe a conta no seletor de um dos campos (origem ou destino) pelo `data-field`. */
function choose(fixture: ComponentFixture<TransferForm>, el: HTMLElement, name: string, accountId: number) {
  (field(el, name).querySelector('button[aria-haspopup]') as HTMLButtonElement).click();
  fixture.detectChanges();
  (document.querySelector(`[role="option"][data-account-id="${accountId}"]`) as HTMLElement).click();
  fixture.detectChanges();
}

function optionIds(fixture: ComponentFixture<TransferForm>, el: HTMLElement, name: string): number[] {
  (field(el, name).querySelector('button[aria-haspopup]') as HTMLButtonElement).click();
  fixture.detectChanges();
  const ids = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).map((o) => Number(o.dataset['accountId']));
  document.querySelector('[role="listbox"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  fixture.detectChanges();
  return ids;
}

function fill(fixture: ComponentFixture<TransferForm>, el: HTMLElement, from: number, to: number, cents: string) {
  choose(fixture, el, 'fromAccountId', from);
  choose(fixture, el, 'toAccountId', to);
  type(el, 'gef-money-input input', cents);
  fixture.detectChanges();
}

const submit = (fixture: ComponentFixture<TransferForm>, el: HTMLElement) => {
  (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
  fixture.detectChanges();
};

describe('TransferForm', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('a origem só oferece conta bancária e dinheiro ativas (nem cartão, nem inativa)', () => {
    const { fixture, el } = setup();
    expect(optionIds(fixture, el, 'fromAccountId')).toEqual([1, 2, 3]);
  });

  it('o destino não oferece a origem escolhida, e trocar a origem para o destino limpa o destino', () => {
    const { fixture, el } = setup();
    choose(fixture, el, 'fromAccountId', 1);
    expect(optionIds(fixture, el, 'toAccountId')).toEqual([2, 3]);

    choose(fixture, el, 'toAccountId', 2);
    expect(field(el, 'toAccountId').textContent).toContain('Carteira');
    choose(fixture, el, 'fromAccountId', 2);
    expect(field(el, 'toAccountId').textContent).not.toContain('Carteira');
    expect(field(el, 'toAccountId').textContent).toContain('Escolha a conta de destino');
  });

  it('a origem vem pré-selecionada pela ação "Transferir" da conta (se elegível)', () => {
    const { el } = setup({ initialFromId: 2 });
    expect(field(el, 'fromAccountId').textContent).toContain('Carteira');

    TestBed.resetTestingModule();
    const cardStart = setup({ initialFromId: 4 });
    expect(field(cardStart.el, 'fromAccountId').textContent).toContain('Escolha a conta de origem');
  });

  it('a prévia mostra o saldo antes e depois das duas contas', () => {
    const { fixture, el } = setup();
    expect(el.querySelector('[data-testid="transfer-preview"]')).toBeNull();

    fill(fixture, el, 1, 2, '25000');

    const preview = el.querySelector('[data-testid="transfer-preview"]') as HTMLElement;
    const from = preview.querySelector('[data-row="from"]') as HTMLElement;
    const to = preview.querySelector('[data-row="to"]') as HTMLElement;
    expect(from.textContent).toContain('Itaú');
    expect(from.textContent).toContain('R$ 1.000,00');
    expect(from.textContent).toContain('R$ 750,00');
    expect(to.textContent).toContain('Carteira');
    expect(to.textContent).toContain('R$ 50,00');
    expect(to.textContent).toContain('R$ 300,00');
    expect(preview.querySelector('[data-testid="negative-warning"]')).toBeNull();
  });

  it('avisa com ícone e texto quando um saldo ficar negativo, mas não bloqueia o envio', () => {
    const { http, fixture, el, saved } = setup();
    fill(fixture, el, 2, 3, '10000');

    const warning = el.querySelector('[data-testid="negative-warning"]') as HTMLElement;
    expect(warning.querySelector('svg')).not.toBeNull();
    expect(warning.textContent).toContain('O saldo de Carteira ficará negativo (-R$ 50,00)');
    expect(warning.textContent).toContain('permitida');

    submit(fixture, el);
    const post = http.expectOne({ method: 'POST', url: `${API}/transfers` });
    expect(post.request.body).toMatchObject({ fromAccountId: 2, toAccountId: 3, amount: '100.00' });
    post.flush({ ...created, fromAccountId: 2, toAccountId: 3 }, { status: 201, statusText: 'Created' });
    expect(saved).toHaveBeenCalled();
  });

  it('sem os saldos a prévia diz "indisponível" e o envio continua possível', () => {
    const { http, fixture, el } = setup({}, null);
    fill(fixture, el, 1, 2, '1000');

    expect(el.querySelector('[data-testid="preview-unavailable"]')).not.toBeNull();
    submit(fixture, el);
    http.expectOne({ method: 'POST', url: `${API}/transfers` }).flush(created, { status: 201, statusText: 'Created' });
  });

  it('data futura avisa que os saldos só mudam na data', () => {
    const { fixture, el } = setup();
    fill(fixture, el, 1, 2, '1000');
    fillDate(el, '#transferDate', '2099-01-15');
    fixture.detectChanges();

    expect((el.querySelector('[data-testid="scheduled-note"]') as HTMLElement).textContent).toContain('15/01/2099');
  });

  it('data fora de 1900 a 2200 não é aceita pelo campo e nada é enviado', () => {
    const { http, fixture, el } = setup();
    fill(fixture, el, 1, 2, '1000');
    for (const iso of ['1899-12-31', '2201-01-01']) {
      fillDate(el, '#transferDate', iso);
      fixture.detectChanges();
      expect(fixture.componentInstance['form'].controls.transferDate.invalid).toBe(true);
      submit(fixture, el);
      http.expectNone(`${API}/transfers`);
    }
  });

  it('cria com o corpo do contrato (descrição aparada, opcional) e uma Idempotency-Key UUID, e avisa que salvou', () => {
    const { http, fixture, el, saved } = setup();
    fill(fixture, el, 1, 2, '10050');
    type(el, '#transferDescription', '  Reserva do mês  ');
    submit(fixture, el);

    const post = http.expectOne({ method: 'POST', url: `${API}/transfers` });
    expect(post.request.body).toEqual({ fromAccountId: 1, toAccountId: 2, amount: '100.50', transferDate: todayIso(), description: 'Reserva do mês' });
    expect(post.request.headers.get('Idempotency-Key')).toMatch(UUID);
    expect(fixture.componentInstance['busy']()).toBe(true);
    post.flush(created, { status: 201, statusText: 'Created' });
    expect(saved).toHaveBeenCalledWith(created);
  });

  it('sem descrição o campo não vai no corpo', () => {
    const { http, fixture, el } = setup();
    fill(fixture, el, 1, 2, '1000');
    submit(fixture, el);

    const post = http.expectOne({ method: 'POST', url: `${API}/transfers` });
    expect(post.request.body).not.toHaveProperty('description');
    post.flush(created, { status: 201, statusText: 'Created' });
  });

  it('campos vazios ou valor zero não enviam e mostram o que falta', () => {
    const { http, fixture, el } = setup();
    submit(fixture, el);
    http.expectNone({ method: 'POST', url: `${API}/transfers` });
    expect(el.textContent).toContain('Escolha a conta de origem.');
    expect(el.textContent).toContain('Escolha a conta de destino.');
    expect(el.textContent).toContain('Informe um valor maior que zero.');

    choose(fixture, el, 'fromAccountId', 1);
    choose(fixture, el, 'toAccountId', 2);
    type(el, 'gef-money-input input', '000');
    submit(fixture, el);
    http.expectNone({ method: 'POST', url: `${API}/transfers` });
    expect(el.textContent).toContain('Informe um valor maior que zero.');
  });

  it('ocupado: um segundo envio enquanto o primeiro não respondeu é ignorado e o botão fica desabilitado', () => {
    const { http, fixture, el } = setup();
    fill(fixture, el, 1, 2, '1000');
    submit(fixture, el);
    const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Salvando');

    submit(fixture, el);
    const post = http.expectOne({ method: 'POST', url: `${API}/transfers` });
    post.flush(created, { status: 201, statusText: 'Created' });
  });

  it('mostra os erros de campo do servidor sem perder o que foi digitado', () => {
    const { http, fixture, el, saved } = setup();
    fill(fixture, el, 1, 2, '1000');
    submit(fixture, el);
    http.expectOne({ method: 'POST', url: `${API}/transfers` }).flush(
      { code: 'ACCOUNT_INACTIVE', detail: 'A conta de origem está inativa.', errors: [{ field: 'fromAccountId', message: 'A conta de origem está inativa.' }, { field: 'amount', message: 'Valor fora do limite permitido.' }] },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="transfer-error"]')?.textContent).toContain('A conta de origem está inativa.');
    expect(field(el, 'fromAccountId').textContent).toContain('A conta de origem está inativa.');
    expect(field(el, 'amount').textContent).toContain('Valor fora do limite permitido.');
    expect(field(el, 'fromAccountId').textContent).toContain('Itaú');
    expect(saved).not.toHaveBeenCalled();
    expect((el.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('sem conexão mostra o aviso de que a ação precisa de internet e mantém o formulário', () => {
    const { http, fixture, el } = setup();
    fill(fixture, el, 1, 2, '1000');
    submit(fixture, el);
    http.expectOne({ method: 'POST', url: `${API}/transfers` }).flush({ code: 'OFFLINE_REQUIRES_CONNECTION' }, { status: 0, statusText: 'Offline' });
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="transfer-error"]')?.textContent).toContain('precisa de conexão com a internet');
    expect(field(el, 'toAccountId').textContent).toContain('Carteira');
  });

  it('reenviar o mesmo corpo após falha de rede reaproveita a chave; mudar o corpo ou levar um erro 4xx gera outra', () => {
    const { http, fixture, el } = setup();
    fill(fixture, el, 1, 2, '1000');
    submit(fixture, el);
    const first = http.expectOne({ method: 'POST', url: `${API}/transfers` });
    const key = first.request.headers.get('Idempotency-Key');
    first.error(new ProgressEvent('error'), { status: 0 });
    fixture.detectChanges();

    submit(fixture, el);
    const retry = http.expectOne({ method: 'POST', url: `${API}/transfers` });
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush({ code: 'VALIDATION_ERROR', detail: 'Há campos inválidos.' }, { status: 422, statusText: 'Unprocessable Entity' });
    fixture.detectChanges();

    submit(fixture, el);
    const afterRejection = http.expectOne({ method: 'POST', url: `${API}/transfers` });
    expect(afterRejection.request.headers.get('Idempotency-Key')).not.toBe(key);
    afterRejection.error(new ProgressEvent('error'), { status: 0 });
    fixture.detectChanges();

    type(el, 'gef-money-input input', '2000');
    submit(fixture, el);
    const changed = http.expectOne({ method: 'POST', url: `${API}/transfers` });
    expect(changed.request.headers.get('Idempotency-Key')).not.toBe(afterRejection.request.headers.get('Idempotency-Key'));
    changed.flush(created, { status: 201, statusText: 'Created' });
  });

  describe('editar', () => {
    const existing: Transfer = { id: 9, fromAccountId: 1, toAccountId: 2, amount: '100.00', transferDate: todayIso(), description: 'Reserva', scheduled: false, version: 3 };

    it('traz os valores atuais, desconta a própria transferência dos saldos da prévia e envia PUT completo com a version', () => {
      // Saldos já refletem a transferência (Itaú 1000 = 1100 - 100; Carteira 50 = -50 + 100).
      const { http, fixture, el, saved } = setup({ transfer: existing });
      expect(field(el, 'fromAccountId').textContent).toContain('Itaú');
      expect(field(el, 'toAccountId').textContent).toContain('Carteira');
      expect((el.querySelector('gef-money-input input') as HTMLInputElement).value).toBe('100,00');
      expect((el.querySelector('#transferDescription') as HTMLInputElement).value).toBe('Reserva');

      const from = el.querySelector('[data-row="from"]') as HTMLElement;
      const to = el.querySelector('[data-row="to"]') as HTMLElement;
      expect(from.textContent).toContain('R$ 1.100,00');
      expect(from.textContent).toContain('R$ 1.000,00');
      expect(to.textContent).toContain('-R$ 50,00');
      expect(to.textContent).toContain('R$ 50,00');

      type(el, 'gef-money-input input', '25000');
      type(el, '#transferDescription', '');
      submit(fixture, el);
      const put = http.expectOne({ method: 'PUT', url: `${API}/transfers/9` });
      expect(put.request.body).toEqual({ fromAccountId: 1, toAccountId: 2, amount: '250.00', transferDate: todayIso(), version: 3 });
      expect(put.request.headers.get('Idempotency-Key')).toMatch(UUID);
      put.flush({ ...existing, amount: '250.00', version: 4 });
      expect(saved).toHaveBeenCalled();
    });

    it('conta da transferência que ficou inativa não vem escolhida: é preciso escolher outra', () => {
      const { http, fixture, el } = setup({ transfer: { ...existing, toAccountId: 5 } });
      expect(field(el, 'toAccountId').textContent).toContain('Escolha a conta de destino');
      submit(fixture, el);
      http.expectNone({ method: 'PUT', url: `${API}/transfers/9` });
      expect(el.textContent).toContain('Escolha a conta de destino.');
    });

    it('transferência agendada (data futura) não está no saldo: a prévia não desconta nada dela', () => {
      const { el } = setup({ transfer: { ...existing, transferDate: '2099-01-01', scheduled: true } });
      const from = el.querySelector('[data-row="from"]') as HTMLElement;
      expect(from.textContent).toContain('R$ 1.000,00');
      expect(from.textContent).not.toContain('R$ 1.100,00');
    });
  });

  it('Cancelar avisa quem hospeda o formulário', () => {
    const { el, cancelled } = setup();
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancelar') as HTMLButtonElement).click();
    expect(cancelled).toHaveBeenCalled();
  });
});
