import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API, configureHttpTesting, select, type } from '../../testing/testbed';
import { GroupForm } from './group-form';

describe('GroupForm', () => {
  async function setup() {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(GroupForm);
    fixture.detectChanges();
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  function fill(el: HTMLElement, fixture: { detectChanges(): void }, account: string) {
    type(el, '#description', 'Mercado');
    select(el, '#accountId', account);
    fixture.detectChanges();
    select(el, '#categoryId', '10');
    type(el, 'gef-money-input input', '15000');
    fixture.detectChanges();
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('mostra só categorias da natureza escolhida', async () => {
    const { el, fixture } = await setup();
    expect(el.querySelector('#categoryId')?.textContent).toContain('Alimentação');
    expect(el.querySelector('#categoryId')?.textContent).not.toContain('Salário');

    select(el, '#kind', 'INCOME');
    fixture.detectChanges();
    expect(el.querySelector('#categoryId')?.textContent).toContain('Salário');
    expect(el.querySelector('#categoryId')?.textContent).not.toContain('Alimentação');
  });

  it('fora do cartão pede o vencimento e o envia', async () => {
    const { http, el, fixture } = await setup();
    fill(el, fixture, '1');
    expect(el.querySelector('#firstDueDate')).not.toBeNull();
    type(el, '#purchaseDate', '2026-11-08');
    type(el, '#firstDueDate', '2026-11-12');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).toEqual({
      description: 'Mercado',
      recurrenceType: 'VARIABLE',
      totalAmount: '150.00',
      accountId: 1,
      categoryId: 10,
      purchaseDate: '2026-11-08',
      firstDueDate: '2026-11-12',
    });
    post.flush({}, { status: 201, statusText: 'Created' });
  });

  it('no cartão esconde o vencimento, mostra a prévia pela fatura e não envia firstDueDate', async () => {
    const { http, el, fixture } = await setup();
    fill(el, fixture, '2');
    type(el, '#purchaseDate', '2026-11-12'); // após o fechamento (dia 10)
    fixture.detectChanges();

    expect(el.querySelector('#firstDueDate')).toBeNull();
    expect(el.textContent).toContain('Vence em 17/12/2026');

    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).not.toHaveProperty('firstDueDate');
    expect(post.request.body.accountId).toBe(2);
    post.flush({}, { status: 201, statusText: 'Created' });
  });

  it('não envia com campos obrigatórios vazios', async () => {
    const { http, el, fixture } = await setup();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    http.expectNone({ method: 'POST', url: `${API}/transaction-groups` });
    expect(el.textContent).toContain('Informe a descrição.');
    expect(el.textContent).toContain('Escolha a conta.');
    expect(el.textContent).toContain('Escolha a categoria.');
  });

  it('valor zerado não é enviado e mostra o aviso, mantendo o que foi digitado', async () => {
    const { http, el, fixture } = await setup();
    type(el, '#description', 'Padaria');
    select(el, '#accountId', '1');
    fixture.detectChanges();
    select(el, '#categoryId', '10');
    type(el, 'gef-money-input input', '0');
    type(el, '#purchaseDate', '2026-11-08');
    type(el, '#firstDueDate', '2026-11-12');
    fixture.detectChanges();

    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    http.expectNone({ method: 'POST', url: `${API}/transaction-groups` });
    expect(el.textContent).toContain('Informe um valor maior que zero.');
    expect((el.querySelector('#description') as HTMLInputElement).value).toBe('Padaria');
  });
});

describe('GroupForm parcelado', () => {
  async function setupInstallment() {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(GroupForm);
    fixture.detectChanges();
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    select(el, '#recurrenceType', 'INSTALLMENT');
    fixture.detectChanges();
    return { ...ctx, fixture, el };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('mostra a quantidade de parcelas e a prévia com vencimentos pela fatura do cartão', async () => {
    const { el, fixture } = await setupInstallment();
    select(el, '#accountId', '2'); // Nubank: fecha dia 10, vence dia 17
    type(el, '#purchaseDate', '2026-11-12'); // depois do fechamento
    type(el, 'gef-money-input input', '10000'); // R$ 100,00
    type(el, '#totalInstallments', '3');
    fixture.detectChanges();

    const preview = el.querySelector('[aria-label="Prévia das parcelas"]') as HTMLElement;
    expect(preview.textContent).toContain('1/3');
    expect(preview.textContent).toContain('17/12/2026');
    expect(preview.textContent).toContain('17/01/2027');
    expect(preview.textContent).toContain('R$ 33,33');
    expect(preview.textContent).toContain('R$ 33,34'); // resto na última
    expect(el.textContent).toContain('Valor total');
  });

  it('fora do cartão usa o primeiro vencimento informado e envia a quantidade de parcelas', async () => {
    const { http, el, fixture } = await setupInstallment();
    type(el, '#description', 'Carnê');
    select(el, '#accountId', '1');
    fixture.detectChanges();
    select(el, '#categoryId', '10');
    type(el, 'gef-money-input input', '30000');
    type(el, '#totalInstallments', '3');
    type(el, '#purchaseDate', '2026-11-01');
    type(el, '#firstDueDate', '2026-11-10');
    fixture.detectChanges();
    expect((el.querySelector('[aria-label="Prévia das parcelas"]') as HTMLElement).textContent).toContain('10/12/2026');

    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).toMatchObject({
      recurrenceType: 'INSTALLMENT',
      totalAmount: '300.00',
      totalInstallments: 3,
      firstDueDate: '2026-11-10',
    });
    post.flush({}, { status: 201, statusText: 'Created' });
  });
});

describe('GroupForm - falha de conexão e toque duplo', () => {
  async function setup() {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(GroupForm);
    fixture.detectChanges();
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    type(el, '#description', 'Mercado');
    select(el, '#accountId', '1');
    fixture.detectChanges();
    select(el, '#categoryId', '10');
    type(el, 'gef-money-input input', '15000');
    type(el, '#purchaseDate', '2026-11-08');
    type(el, '#firstDueDate', '2026-11-12');
    fixture.detectChanges();
    return { ...ctx, fixture, el };
  }
  const submitForm = (el: HTMLElement) => (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('sem conexão ao salvar avisa e mantém tudo o que foi digitado para tentar de novo', async () => {
    const { http, el, fixture } = await setup();
    submitForm(el);
    http.expectOne({ method: 'POST', url: `${API}/transaction-groups` }).error(new ProgressEvent('error'), { status: 0 });
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Sem conexão');
    expect((el.querySelector('#description') as HTMLInputElement).value).toBe('Mercado');
    expect((el.querySelector('#firstDueDate') as HTMLInputElement).value).toBe('2026-11-12');
    // tentar de novo funciona
    submitForm(el);
    http.expectOne({ method: 'POST', url: `${API}/transaction-groups` }).flush({}, { status: 201, statusText: 'Created' });
  });

  it('enviar duas vezes seguidas registra uma única vez', async () => {
    const { http, el } = await setup();
    submitForm(el);
    submitForm(el);
    http.expectOne({ method: 'POST', url: `${API}/transaction-groups` }).flush({}, { status: 201, statusText: 'Created' });
  });
});
