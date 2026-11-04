import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { isoToBR, todayIso } from '@gefinc/utils';
import { API, chooseAccount, configureHttpTesting, fillDate, optionLabels, pickOption, selectTrigger, type } from '../../testing/testbed';
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
    chooseAccount(fixture, el, account);
    pickOption(fixture, 'Categoria', 'Alimentação');
    type(el, 'gef-money-input input', '15000');
    fixture.detectChanges();
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('mostra só categorias da natureza escolhida', async () => {
    const { el, fixture } = await setup();
    expect(optionLabels(fixture, 'Categoria')).toEqual(['Selecione…', 'Alimentação', 'Lazer']);

    (el.querySelector('#kind-INCOME') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(optionLabels(fixture, 'Categoria')).toEqual(['Selecione…', 'Salário']);
  });

  it('a natureza (receita ou despesa) é o primeiro campo e é um seletor visível', async () => {
    const { el } = await setup();
    const firstField = el.querySelector('form')!.querySelector('fieldset, label, input, select, gef-select');
    expect(firstField?.tagName).toBe('FIELDSET');
    expect(firstField?.textContent).toContain('Natureza');
    const options = Array.from(el.querySelectorAll('[data-field="kind"] label')).map((l) => l.textContent?.trim());
    expect(options).toEqual(['Despesa', 'Receita']);
    expect((el.querySelector('#kind-EXPENSE') as HTMLInputElement).checked).toBe(true);
  });

  it('trocar a natureza zera a categoria escolhida', async () => {
    const { el, fixture } = await setup();
    pickOption(fixture, 'Categoria', 'Alimentação');
    fixture.detectChanges();
    expect(selectTrigger(el, 'Categoria').textContent).toContain('Alimentação');
    (el.querySelector('#kind-INCOME') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(selectTrigger(el, 'Categoria').textContent).toContain('Selecione…');
  });

  it('fora do cartão pede o vencimento e o envia', async () => {
    const { http, el, fixture } = await setup();
    fill(el, fixture, '1');
    expect(el.querySelector('#firstDueDate')).not.toBeNull();
    fillDate(el, '#purchaseDate', '2026-11-08');
    fillDate(el, '#firstDueDate', '2026-11-12');
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

  it('data da compra apagada não é enviada e pede a data; digitada pela metade mostra o aviso do campo', async () => {
    const { http, el, fixture } = await setup();
    fill(el, fixture, '1');
    type(el, '#purchaseDate', '');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    http.expectNone({ method: 'POST', url: `${API}/transaction-groups` });
    expect(el.textContent).toContain('Informe a data.');

    type(el, '#purchaseDate', '0811');
    (el.querySelector('#purchaseDate') as HTMLInputElement).dispatchEvent(new Event('blur'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    http.expectNone({ method: 'POST', url: `${API}/transaction-groups` });
    expect(el.textContent).toContain('dd/mm/aaaa');
    expect(el.textContent).not.toContain('Informe a data.');
  });

  it('no cartão esconde o vencimento, mostra a prévia pela fatura e não envia firstDueDate', async () => {
    const { http, el, fixture } = await setup();
    fill(el, fixture, '2');
    fillDate(el, '#purchaseDate', '2026-11-12'); // após o fechamento (dia 10)
    fixture.detectChanges();

    expect(el.querySelector('#firstDueDate')).toBeNull();
    expect(el.textContent).toContain('Vence em 17/12/2026');

    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).not.toHaveProperty('firstDueDate');
    expect(post.request.body.accountId).toBe(2);
    post.flush({}, { status: 201, statusText: 'Created' });
  });

  describe('vencimento digitado pela metade e depois oculto', () => {
    const submit = (el: HTMLElement) => (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    it('trocar para o cartão descarta o vencimento incompleto e o envio acontece', async () => {
      const { http, el, fixture } = await setup();
      type(el, '#firstDueDate', '3101');
      (el.querySelector('#firstDueDate') as HTMLInputElement).dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(el.textContent).toContain('dd/mm/aaaa');

      fill(el, fixture, '2'); // o cartão tira o campo do DOM
      fixture.detectChanges();
      expect(el.querySelector('#firstDueDate')).toBeNull();

      submit(el);
      const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
      expect(post.request.body.accountId).toBe(2);
      expect(post.request.body).not.toHaveProperty('firstDueDate');
      post.flush({}, { status: 201, statusText: 'Created' });
    });

    it('trocar para receita descarta o vencimento incompleto e o envio acontece', async () => {
      const { http, el, fixture } = await setup();
      chooseAccount(fixture, el, '1');
      type(el, '#firstDueDate', '3101');
      fixture.detectChanges();

      (el.querySelector('#kind-INCOME') as HTMLInputElement).click();
      fixture.detectChanges();
      expect(el.querySelector('#firstDueDate')).toBeNull();
      type(el, '#description', 'Salário');
      pickOption(fixture, 'Categoria', 'Salário');
      type(el, 'gef-money-input input', '500000');
      fixture.detectChanges();

      submit(el);
      const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
      expect(post.request.body.categoryId).toBe(20);
      expect(post.request.body.firstDueDate).toBe(post.request.body.purchaseDate);
      post.flush({}, { status: 201, statusText: 'Created' });
    });

    it('a data principal, que troca de campo entre despesa e receita, também não guarda erro velho', async () => {
      const { http, el, fixture } = await setup();
      type(el, '#purchaseDate', '0811');
      (el.querySelector('#kind-INCOME') as HTMLInputElement).click();
      fixture.detectChanges();
      type(el, '#description', 'Salário');
      chooseAccount(fixture, el, '1');
      pickOption(fixture, 'Categoria', 'Salário');
      type(el, 'gef-money-input input', '500000');
      fillDate(el, '#purchaseDate', '2026-11-05');
      submit(el);
      const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
      expect(post.request.body.purchaseDate).toBe('2026-11-05');
      post.flush({}, { status: 201, statusText: 'Created' });
    });

    it('voltar para a conta bancária mostra o campo limpo, com data padrão e validando de novo', async () => {
      const { http, el, fixture } = await setup();
      chooseAccount(fixture, el, '1');
      type(el, '#firstDueDate', '3101');
      chooseAccount(fixture, el, '2');
      expect(el.querySelector('#firstDueDate')).toBeNull();

      chooseAccount(fixture, el, '1');
      const field = el.querySelector('#firstDueDate') as HTMLInputElement;
      expect(field.value).toBe(isoToBR(todayIso()));
      expect(field.getAttribute('aria-invalid')).toBeNull();

      // a validação do campo voltou: data incompleta bloqueia o envio e mostra o aviso
      type(el, '#firstDueDate', '3101');
      (el.querySelector('#firstDueDate') as HTMLInputElement).dispatchEvent(new Event('blur'));
      fill(el, fixture, '1');
      submit(el);
      fixture.detectChanges();
      http.expectNone({ method: 'POST', url: `${API}/transaction-groups` });
      expect((el.querySelector('#firstDueDate') as HTMLInputElement).getAttribute('aria-invalid')).toBe('true');
      expect(el.textContent).toContain('dd/mm/aaaa');

      // corrigida a data, o envio acontece
      fillDate(el, '#firstDueDate', '2026-11-12');
      submit(el);
      const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
      expect(post.request.body.firstDueDate).toBe('2026-11-12');
      post.flush({}, { status: 201, statusText: 'Created' });
    });
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
    chooseAccount(fixture, el, '1');
    fixture.detectChanges();
    pickOption(fixture, 'Categoria', 'Alimentação');
    type(el, 'gef-money-input input', '0');
    fillDate(el, '#purchaseDate', '2026-11-08');
    fillDate(el, '#firstDueDate', '2026-11-12');
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
    pickOption(fixture, 'Tipo', 'Parcelado');
    fixture.detectChanges();
    return { ...ctx, fixture, el };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('mostra a quantidade de parcelas e a prévia com vencimentos pela fatura do cartão', async () => {
    const { el, fixture } = await setupInstallment();
    chooseAccount(fixture, el, '2'); // Nubank: fecha dia 10, vence dia 17
    fillDate(el, '#purchaseDate', '2026-11-12'); // depois do fechamento
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
    chooseAccount(fixture, el, '1');
    fixture.detectChanges();
    pickOption(fixture, 'Categoria', 'Alimentação');
    type(el, 'gef-money-input input', '30000');
    type(el, '#totalInstallments', '3');
    fillDate(el, '#purchaseDate', '2026-11-01');
    fillDate(el, '#firstDueDate', '2026-11-10');
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

describe('GroupForm parcelado - valor da parcela ou total', () => {
  async function setupInstallment() {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(GroupForm);
    fixture.detectChanges();
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    pickOption(fixture, 'Tipo', 'Parcelado');
    fixture.detectChanges();
    return { ...ctx, fixture, el };
  }
  const submitForm = (el: HTMLElement) => (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
  const modeButton = (el: HTMLElement, label: string) =>
    Array.from(el.querySelectorAll('[aria-label="Forma de informar"] button')).find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
  const fillCard = (el: HTMLElement, fixture: { detectChanges(): void }) => {
    type(el, '#description', 'Geladeira');
    chooseAccount(fixture, el, '2'); // Nubank: fecha dia 10, vence dia 17
    pickOption(fixture, 'Categoria', 'Alimentação');
    fillDate(el, '#purchaseDate', '2026-11-12'); // depois do fechamento
    fixture.detectChanges();
  };

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('só mostra o par de botões de modo quando o tipo é Parcelado, com o total como padrão', async () => {
    const { el, fixture } = await setupInstallment();
    expect(modeButton(el, 'Valor total').getAttribute('aria-pressed')).toBe('true');
    expect(modeButton(el, 'Valor da parcela').getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelector('gef-money-input')?.textContent).toContain('Valor total');

    pickOption(fixture, 'Tipo', 'Avulso');
    fixture.detectChanges();
    expect(el.querySelector('[aria-label="Forma de informar"]')).toBeNull();
    expect(el.querySelector('gef-money-input')?.textContent).toContain('Valor');
    expect(el.querySelector('gef-money-input')?.textContent).not.toContain('Valor total');
  });

  it('no modo parcela, 10 × R$ 100,00 envia o total de R$ 1.000,00 e mostra resumo e faturas', async () => {
    const { http, el, fixture } = await setupInstallment();
    fillCard(el, fixture);
    modeButton(el, 'Valor da parcela').click();
    fixture.detectChanges();
    type(el, 'gef-money-input input', '10000'); // R$ 100,00 por parcela
    type(el, '#totalInstallments', '10');
    fixture.detectChanges();

    expect(el.querySelector('gef-money-input')?.textContent).toContain('Valor da parcela');
    expect(modeButton(el, 'Valor da parcela').getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[data-testid="installment-summary"]')?.textContent?.trim()).toBe('10 × R$ 100,00 = R$ 1.000,00');
    const preview = el.querySelector('[aria-label="Prévia das parcelas"]') as HTMLElement;
    expect(preview.textContent).toContain('Fatura');
    expect(preview.textContent).toContain('dez/2026 · vence 17/12');
    expect(preview.textContent).toContain('set/2027 · vence 17/09');
    expect(preview.textContent).toContain('10/10');

    submitForm(el);
    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).toEqual({
      description: 'Geladeira',
      recurrenceType: 'INSTALLMENT',
      totalAmount: '1000.00',
      totalInstallments: 10,
      accountId: 2,
      categoryId: 10,
      purchaseDate: '2026-11-12',
    });
    post.flush({}, { status: 201, statusText: 'Created' });
  });

  it('no modo total com resto o resumo separa a última parcela e o total é o digitado', async () => {
    const { http, el, fixture } = await setupInstallment();
    fillCard(el, fixture);
    type(el, 'gef-money-input input', '10000'); // total R$ 100,00
    type(el, '#totalInstallments', '3');
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="installment-summary"]')?.textContent?.trim()).toBe('2 × R$ 33,33 + 1 × R$ 33,34');

    submitForm(el);
    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).toMatchObject({ totalAmount: '100.00', totalInstallments: 3 });
    post.flush({}, { status: 201, statusText: 'Created' });
  });

  it('alternar o modo não converte o número digitado', async () => {
    const { el, fixture } = await setupInstallment();
    fillCard(el, fixture);
    type(el, 'gef-money-input input', '10000');
    type(el, '#totalInstallments', '4');
    modeButton(el, 'Valor da parcela').click();
    fixture.detectChanges();
    expect((el.querySelector('gef-money-input input') as HTMLInputElement).value).toBe('100,00');
    expect(el.querySelector('[data-testid="installment-summary"]')?.textContent?.trim()).toBe('4 × R$ 100,00 = R$ 400,00');
  });

  it('fora do cartão o modo parcela também vale e a prévia não tem coluna Fatura', async () => {
    const { http, el, fixture } = await setupInstallment();
    type(el, '#description', 'Carnê');
    chooseAccount(fixture, el, '1');
    pickOption(fixture, 'Categoria', 'Alimentação');
    modeButton(el, 'Valor da parcela').click();
    type(el, 'gef-money-input input', '10000');
    type(el, '#totalInstallments', '3');
    fillDate(el, '#purchaseDate', '2026-11-01');
    fillDate(el, '#firstDueDate', '2026-11-10');
    fixture.detectChanges();

    const preview = el.querySelector('[aria-label="Prévia das parcelas"]') as HTMLElement;
    expect(preview.textContent).not.toContain('Fatura');
    expect(preview.textContent).toContain('10/12/2026');

    submitForm(el);
    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).toMatchObject({ totalAmount: '300.00', totalInstallments: 3, firstDueDate: '2026-11-10' });
    post.flush({}, { status: 201, statusText: 'Created' });
  });

  it('total menor que um centavo por parcela não é enviado e não tem prévia', async () => {
    const { http, el, fixture } = await setupInstallment();
    fillCard(el, fixture);
    type(el, 'gef-money-input input', '5'); // R$ 0,05 de total
    type(el, '#totalInstallments', '10');
    fixture.detectChanges();

    expect(el.querySelector('[aria-label="Prévia das parcelas"]')).toBeNull();
    expect(el.textContent).toContain('O valor deve ter pelo menos R$ 0,01 por parcela.');
    submitForm(el);
    http.expectNone({ method: 'POST', url: `${API}/transaction-groups` });
  });

  it.each([['', 'vazio'], ['0', 'zero'], ['121', 'acima de 120'], ['2.5', 'fracionário']])(
    'quantidade de parcelas %j (%s) não é enviada e mostra o aviso sob o campo, com aria',
    async (value) => {
      const { http, el, fixture } = await setupInstallment();
      fillCard(el, fixture);
      type(el, 'gef-money-input input', '10000');
      type(el, '#totalInstallments', value);
      fixture.detectChanges();
      expect(el.querySelector('#totalInstallments-error')).toBeNull();

      submitForm(el);
      fixture.detectChanges();

      http.expectNone({ method: 'POST', url: `${API}/transaction-groups` });
      const input = el.querySelector('#totalInstallments') as HTMLInputElement;
      const error = el.querySelector('#totalInstallments-error') as HTMLElement;
      expect(error.textContent).toContain('Informe de 1 a 120 parcelas.');
      expect(error.getAttribute('role')).toBe('alert');
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe('totalInstallments-error');
    },
  );

  it('corrigir a quantidade de parcelas tira o aviso', async () => {
    const { el, fixture } = await setupInstallment();
    fillCard(el, fixture);
    type(el, 'gef-money-input input', '10000');
    type(el, '#totalInstallments', '0');
    submitForm(el);
    fixture.detectChanges();
    expect(el.querySelector('#totalInstallments-error')).not.toBeNull();

    type(el, '#totalInstallments', '12');
    fixture.detectChanges();
    expect(el.querySelector('#totalInstallments-error')).toBeNull();
    expect(el.querySelector('#totalInstallments')?.getAttribute('aria-invalid')).toBeNull();
  });

  it('mostra o erro 422 de valor e de parcelas no próprio campo, mantendo o digitado', async () => {
    const { http, el, fixture } = await setupInstallment();
    fillCard(el, fixture);
    type(el, 'gef-money-input input', '10000');
    type(el, '#totalInstallments', '3');
    fixture.detectChanges();
    submitForm(el);

    http.expectOne({ method: 'POST', url: `${API}/transaction-groups` }).flush(
      {
        status: 422,
        errors: [
          { field: 'totalAmount', message: 'Valor fora do limite permitido.' },
          { field: 'totalInstallments', message: 'Informe de 1 a 120 parcelas.' },
        ],
      },
      { status: 422, statusText: 'Unprocessable' },
    );
    fixture.detectChanges();

    expect(el.querySelector('gef-money-input')?.parentElement?.textContent).toContain('Valor fora do limite permitido.');
    expect(el.querySelector('#totalInstallments')?.parentElement?.textContent).toContain('Informe de 1 a 120 parcelas.');
    expect((el.querySelector('#description') as HTMLInputElement).value).toBe('Geladeira');
    expect((el.querySelector('gef-money-input input') as HTMLInputElement).value).toBe('100,00');
  });

  it('corrigir uma operação recusada abre em modo total, com o valor como foi enviado', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(GroupForm);
    fixture.componentRef.setInput('initial', {
      description: 'Geladeira', recurrenceType: 'INSTALLMENT', totalAmount: '1000.00', totalInstallments: 10, accountId: 2,
      categoryId: 10, purchaseDate: '2026-11-12',
    });
    fixture.detectChanges();
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(modeButton(el, 'Valor total').getAttribute('aria-pressed')).toBe('true');
    expect((el.querySelector('gef-money-input input') as HTMLInputElement).value).toBe('1.000,00');
    expect(el.querySelector('[data-testid="installment-summary"]')?.textContent?.trim()).toBe('10 × R$ 100,00 = R$ 1.000,00');
  });

  describe('quantidade inválida e troca de tipo', () => {
    const fillOther = (el: HTMLElement, fixture: { detectChanges(): void }) => {
      type(el, '#description', 'Carnê');
      chooseAccount(fixture, el, '1');
      pickOption(fixture, 'Categoria', 'Alimentação');
      type(el, 'gef-money-input input', '30000');
      fixture.detectChanges();
    };

    it.each([
      ['', 'FIXED'], ['0', 'FIXED'], ['121', 'FIXED'],
      ['', 'VARIABLE'], ['0', 'VARIABLE'], ['121', 'VARIABLE'],
    ])('parcelado com quantidade %j trocado para %s envia sem totalInstallments', async (value, target) => {
      const { http, el, fixture } = await setupInstallment();
      type(el, '#totalInstallments', value);
      pickOption(fixture, 'Tipo', { FIXED: 'Fixo mensal', VARIABLE: 'Avulso' }[target as 'FIXED' | 'VARIABLE']);
      fixture.detectChanges();
      expect(el.querySelector('#totalInstallments')).toBeNull();
      fillOther(el, fixture);

      submitForm(el);
      const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
      expect(post.request.body.recurrenceType).toBe(target);
      expect(post.request.body).not.toHaveProperty('totalInstallments');
      post.flush({}, { status: 201, statusText: 'Created' });
    });

    it('abrir com dados de outro tipo e quantidade inválida não bloqueia o envio', async () => {
      const ctx = configureHttpTesting();
      const fixture = TestBed.createComponent(GroupForm);
      fixture.componentRef.setInput('initial', {
        description: 'Aluguel', recurrenceType: 'FIXED', totalAmount: '500.00', totalInstallments: 0, accountId: 1,
        categoryId: 10, purchaseDate: '2026-11-01', firstDueDate: '2026-11-05',
      });
      fixture.detectChanges();
      ctx.flushReference();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      submitForm(el);
      const post = ctx.http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
      expect(post.request.body.recurrenceType).toBe('FIXED');
      expect(post.request.body).not.toHaveProperty('totalInstallments');
      post.flush({}, { status: 201, statusText: 'Created' });
    });

    it('voltar para Parcelado com a quantidade inválida volta a bloquear e mostrar o erro', async () => {
      const { http, el, fixture } = await setupInstallment();
      type(el, '#totalInstallments', '0');
      pickOption(fixture, 'Tipo', 'Avulso');
      fixture.detectChanges();
      fillOther(el, fixture);
      pickOption(fixture, 'Tipo', 'Parcelado');
      fixture.detectChanges();

      submitForm(el);
      fixture.detectChanges();
      http.expectNone({ method: 'POST', url: `${API}/transaction-groups` });
      const error = el.querySelector('#totalInstallments-error') as HTMLElement;
      expect(error.textContent).toContain('Informe de 1 a 120 parcelas.');
      expect(el.querySelector('#totalInstallments')?.getAttribute('aria-invalid')).toBe('true');
    });
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
    chooseAccount(fixture, el, '1');
    fixture.detectChanges();
    pickOption(fixture, 'Categoria', 'Alimentação');
    type(el, 'gef-money-input input', '15000');
    fillDate(el, '#purchaseDate', '2026-11-08');
    fillDate(el, '#firstDueDate', '2026-11-12');
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
    expect((el.querySelector('#firstDueDate') as HTMLInputElement).value).toBe(isoToBR('2026-11-12'));
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

describe('GroupForm - preenchimento inicial (corrigir uma operação recusada)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('abre com os dados informados, que o usuário pode ajustar antes de enviar', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(GroupForm);
    fixture.componentRef.setInput('initial', {
      description: 'Mercado', recurrenceType: 'VARIABLE', totalAmount: '150.00', accountId: 1, categoryId: 10,
      purchaseDate: '2026-11-08', firstDueDate: '2026-11-12',
    });
    fixture.detectChanges();
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect((el.querySelector('#description') as HTMLInputElement).value).toBe('Mercado');
    expect(el.querySelector('gef-account-picker button[aria-haspopup]')?.textContent).toContain('Itaú');
    expect(selectTrigger(el, 'Categoria').textContent).toContain('Alimentação');
    expect((el.querySelector('gef-money-input input') as HTMLInputElement).value).toBe('150,00');
    expect((el.querySelector('#firstDueDate') as HTMLInputElement).value).toBe(isoToBR('2026-11-12'));
  });
});

describe('GroupForm - receita entra na conta', () => {
  async function setup(initial?: object) {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(GroupForm);
    if (initial) {
      fixture.componentRef.setInput('initial', initial);
    }
    fixture.detectChanges();
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { ...ctx, fixture, el };
  }
  const income = (el: HTMLElement, fixture: { detectChanges(): void }) => {
    (el.querySelector('#kind-INCOME') as HTMLInputElement).click();
    fixture.detectChanges();
  };
  const submitForm = (el: HTMLElement) => (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
  const optionIds = (fixture: { detectChanges(): void }, el: HTMLElement) => {
    (el.querySelector('gef-account-picker button[aria-haspopup]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const ids = Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.getAttribute('data-account-id'));
    (document.querySelector('gef-sheet button[aria-label="Fechar"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    return ids;
  };

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('o seletor de conta da receita não lista cartões; o da despesa lista', async () => {
    const { el, fixture } = await setup();
    expect(optionIds(fixture, el)).toEqual(['1', '2']);
    income(el, fixture);
    expect(optionIds(fixture, el)).toEqual(['1']);
  });

  it('trocar para receita com um cartão escolhido troca a conta e avisa', async () => {
    const { el, fixture } = await setup();
    chooseAccount(fixture, el, '2');

    income(el, fixture);

    expect(el.querySelector('gef-account-picker button[aria-haspopup]')?.textContent).toContain('Itaú');
    const notice = el.querySelector('[data-testid="account-notice"]') as HTMLElement;
    expect(notice.textContent).toContain('Cartão não recebe receita; conta trocada para Itaú');
    expect(notice.getAttribute('aria-live')).toBe('polite');
  });

  it('trocar para receita sem conta escolhida não escolhe nada nem avisa', async () => {
    const { el, fixture } = await setup();
    income(el, fixture);
    expect(el.querySelector('[data-testid="account-notice"]')?.textContent?.trim()).toBe('');
    expect(el.querySelector('gef-account-picker button[aria-haspopup]')?.textContent).toContain('Selecione');
  });

  it('em receita há uma única data e nenhum campo de data da compra, vencimento ou "já recebi"', async () => {
    const { el, fixture } = await setup();
    income(el, fixture);

    expect(el.querySelector('label[for="purchaseDate"]')?.textContent).toContain('Data do recebimento');
    expect(el.querySelector('#firstDueDate')).toBeNull();
    expect(el.textContent).not.toContain('Data da compra');
    expect(el.textContent).not.toContain('Vencimento');
    expect(el.textContent).not.toContain('Já recebi');
    expect(el.querySelector('.gef-switch')).toBeNull();
  });

  it('o recebimento fixo chama a data de "Primeiro recebimento"', async () => {
    const { el, fixture } = await setup();
    income(el, fixture);
    pickOption(fixture, 'Tipo', 'Fixo mensal');
    fixture.detectChanges();
    expect(el.querySelector('label[for="purchaseDate"]')?.textContent).toContain('Primeiro recebimento');
  });

  it('a dica diz que a receita de hoje entra na conta hoje, a passada na data informada e a futura fica a receber até a data', async () => {
    const { el, fixture } = await setup();
    income(el, fixture);
    const hint = () => el.querySelector('[data-testid="income-hint"]')?.textContent?.trim();
    expect(hint()).toBe('Entra na conta hoje');

    fillDate(el, '#purchaseDate', '2999-12-25');
    fixture.detectChanges();
    expect(hint()).toBe('Fica a receber até 25/12/2999');

    fillDate(el, '#purchaseDate', '2020-01-02');
    fixture.detectChanges();
    expect(hint()).toBe('Entra na conta na data informada');

    fillDate(el, '#purchaseDate', todayIso());
    fixture.detectChanges();
    expect(hint()).toBe('Entra na conta hoje');
  });

  it('envia a data do recebimento como data do lançamento e vencimento, sem settled', async () => {
    const { http, el, fixture } = await setup();
    income(el, fixture);
    type(el, '#description', 'Salário');
    chooseAccount(fixture, el, '1');
    pickOption(fixture, 'Categoria', 'Salário');
    type(el, 'gef-money-input input', '500000');
    fillDate(el, '#purchaseDate', '2026-11-05');
    fixture.detectChanges();

    submitForm(el);

    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).toEqual({
      description: 'Salário',
      recurrenceType: 'VARIABLE',
      totalAmount: '5000.00',
      accountId: 1,
      categoryId: 20,
      purchaseDate: '2026-11-05',
      firstDueDate: '2026-11-05',
    });
    post.flush({}, { status: 201, statusText: 'Created' });
  });

  it('despesa nunca envia settled', async () => {
    const { http, el, fixture } = await setup();
    type(el, '#description', 'Mercado');
    chooseAccount(fixture, el, '1');
    pickOption(fixture, 'Categoria', 'Alimentação');
    type(el, 'gef-money-input input', '1000');
    fixture.detectChanges();
    submitForm(el);
    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).not.toHaveProperty('settled');
    post.flush({}, { status: 201, statusText: 'Created' });
  });

  it('mostra o erro do servidor no campo da conta e mantém o digitado', async () => {
    const { http, el, fixture } = await setup();
    income(el, fixture);
    type(el, '#description', 'Salário');
    chooseAccount(fixture, el, '1');
    pickOption(fixture, 'Categoria', 'Salário');
    type(el, 'gef-money-input input', '500000');
    fixture.detectChanges();
    submitForm(el);

    http
      .expectOne({ method: 'POST', url: `${API}/transaction-groups` })
      .flush(
        { status: 422, errors: [{ field: 'accountId', message: 'Receita só pode entrar em conta.' }] },
        { status: 422, statusText: 'Unprocessable' },
      );
    fixture.detectChanges();

    expect(el.querySelector('gef-account-picker')?.parentElement?.textContent).toContain('Receita só pode entrar em conta.');
    expect((el.querySelector('#description') as HTMLInputElement).value).toBe('Salário');
  });

  it('o valor em destaque é colorido pela natureza', async () => {
    const { el, fixture } = await setup();
    const field = () => el.querySelector('gef-money-input input') as HTMLInputElement;
    expect(field().className).toContain('text-gefinc-danger');
    income(el, fixture);
    expect(field().className).toContain('text-gefinc-primary');
  });

  it('corrigir uma receita recusada em cartão troca a conta, avisa e junta as datas', async () => {
    const { el } = await setup({
      description: 'Salário', recurrenceType: 'VARIABLE', totalAmount: '5000.00', accountId: 2, categoryId: 20,
      purchaseDate: '2026-11-01', firstDueDate: '2026-11-05',
    });

    expect(el.querySelector('gef-account-picker button[aria-haspopup]')?.textContent).toContain('Itaú');
    expect(el.querySelector('[data-testid="account-notice"]')?.textContent).toContain('conta trocada para Itaú');
    expect((el.querySelector('#purchaseDate') as HTMLInputElement).value).toBe(isoToBR('2026-11-05'));
  });
});
