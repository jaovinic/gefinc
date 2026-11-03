const store = new Map<string, string>();

jest.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: jest.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
    set: jest.fn(async ({ key, value }: { key: string; value: string }) => void store.set(key, value)),
  },
}));
jest.mock('@capacitor/haptics', () => ({
  Haptics: { impact: jest.fn(async () => undefined) },
  ImpactStyle: { Light: 'LIGHT' },
}));

import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { DraftService, NoticeService } from '@gefinc/ui-shared';
import { todayIso } from '@gefinc/utils';
import { API, chooseAccount, configureMobileTesting, select, type } from '../../test/testbed';
import { NewEntryPage } from './new-entry.page';

const dayIso = (offset: number) => todayIso(new Date(Date.now() + offset * 86_400_000));

describe('NewEntryPage (despesa e receita na mesma tela)', () => {
  async function setup(query: Record<string, string> = {}) {
    const ctx = configureMobileTesting([
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query), data: {} } } },
    ]);
    const fixture = TestBed.createComponent(NewEntryPage);
    fixture.detectChanges();
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }
  const income = (el: HTMLElement, fixture: { detectChanges(): void }) => {
    (el.querySelector('#kind-INCOME') as HTMLInputElement).click();
    fixture.detectChanges();
  };
  const submit = (el: HTMLElement) => (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
  const optionIds = (fixture: { detectChanges(): void }, el: HTMLElement) => {
    (el.querySelector('gef-account-picker button[aria-haspopup]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const ids = Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.getAttribute('data-account-id'));
    (document.querySelector('gef-sheet button[aria-label="Fechar"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    return ids;
  };

  beforeEach(() => {
    store.clear();
    sessionStorage.clear();
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('o cabeçalho tem o botão de fechar e o título "Novo lançamento" em uma só linha', async () => {
    const { el } = await setup();
    const h1 = el.querySelector('h1') as HTMLElement;
    expect(h1.textContent?.trim()).toBe('Novo lançamento');
    expect(h1.className).toContain('whitespace-nowrap');
    expect(el.querySelector('header a[aria-label="Cancelar"]')?.getAttribute('href')).toBe('/');
  });

  it('o primeiro controle é o seletor de natureza, com Despesa marcada por padrão', async () => {
    const { el } = await setup();
    const first = el.querySelector('form')!.querySelector('gef-kind-switch, gef-money-input, input, select');
    expect(first?.tagName.toLowerCase()).toBe('gef-kind-switch');
    expect((el.querySelector('#kind-EXPENSE') as HTMLInputElement).checked).toBe(true);
    expect(el.querySelector('#categoryId')?.textContent).toContain('Alimentação');
    expect(el.querySelector('#categoryId')?.textContent).not.toContain('Salário');
  });

  it('?tipo=receita abre já em Receita, com a categoria Salário e sem cartões na lista de contas', async () => {
    const { el, fixture } = await setup({ tipo: 'receita' });
    expect((el.querySelector('#kind-INCOME') as HTMLInputElement).checked).toBe(true);
    expect((el.querySelector('#categoryId') as HTMLSelectElement).selectedOptions[0].textContent).toContain('Salário');
    expect(el.querySelector('input[placeholder="Ex.: Salário"]')).not.toBeNull();
    expect(optionIds(fixture, el)).toEqual(['1']);
  });

  it('o valor em destaque é focado ao abrir e colorido pela natureza', async () => {
    const { el, fixture } = await setup();
    const field = () => el.querySelector('gef-money-input input') as HTMLInputElement;
    expect(el.querySelector('gef-money-input .gef-money-field')?.getAttribute('data-size')).toBe('hero');
    expect(field().className).toContain('text-gefinc-danger');
    income(el, fixture);
    expect(field().className).toContain('text-gefinc-primary');
  });

  it('tocar na natureza devolve o foco ao valor, para o teclado numérico seguir aberto', async () => {
    const { el, fixture } = await setup();
    document.body.appendChild(el);
    (el.querySelector('#description') as HTMLInputElement).focus();
    (el.querySelector('[data-field="kind"]') as HTMLElement).dispatchEvent(new Event('pointerdown', { bubbles: true }));
    income(el, fixture);
    expect(document.activeElement).toBe(el.querySelector('gef-money-input input'));
    el.remove();
  });

  it('trocar a natureza pelo teclado (setas) não rouba o foco do seletor', async () => {
    const { el, fixture } = await setup();
    document.body.appendChild(el);
    const expense = el.querySelector('#kind-EXPENSE') as HTMLInputElement;
    expense.focus();
    expense.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    income(el, fixture);
    expect((el.querySelector('#kind-INCOME') as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement).toBe(expense);
    el.remove();
  });

  it('um toque antigo não vale para uma troca feita depois pelo teclado', async () => {
    const { el, fixture } = await setup();
    document.body.appendChild(el);
    const group = el.querySelector('[data-field="kind"]') as HTMLElement;
    group.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    (el.querySelector('#description') as HTMLInputElement).focus();
    income(el, fixture);
    expect(document.activeElement).toBe(el.querySelector('#description'));
    el.remove();
  });

  it('alternar para Receita troca as categorias e escolhe a categoria padrão de receita', async () => {
    const { el, fixture } = await setup();
    income(el, fixture);
    expect(el.querySelector('#categoryId')?.textContent).toContain('Salário');
    expect(el.querySelector('#categoryId')?.textContent).not.toContain('Alimentação');
    expect((el.querySelector('#categoryId') as HTMLSelectElement).selectedOptions[0].textContent).toContain('Salário');
    expect(optionIds(fixture, el)).toEqual(['1']);
  });

  it('alternar para Receita com um cartão escolhido troca a conta e avisa; voltar a Despesa mantém a conta', async () => {
    const { el, fixture } = await setup();
    chooseAccount(fixture, el, 2);
    income(el, fixture);
    expect(el.querySelector('gef-account-picker button[aria-haspopup]')?.textContent).toContain('Itaú');
    const notice = el.querySelector('[data-testid="account-notice"]') as HTMLElement;
    expect(notice.textContent).toContain('Cartão não recebe receita; conta trocada para Itaú');
    expect(notice.getAttribute('aria-live')).toBe('polite');

    (el.querySelector('#kind-EXPENSE') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(el.querySelector('gef-account-picker button[aria-haspopup]')?.textContent).toContain('Itaú');
  });

  it('a data tem os atalhos Hoje e Ontem', async () => {
    const { el, fixture } = await setup();
    const date = el.querySelector('#date') as HTMLInputElement;
    const button = (label: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
    expect(date.value).toBe(todayIso());
    expect(button('Hoje').getAttribute('aria-pressed')).toBe('true');

    button('Ontem').click();
    fixture.detectChanges();
    expect(date.value).toBe(dayIso(-1));
    expect(button('Ontem').getAttribute('aria-pressed')).toBe('true');
    expect(button('Hoje').getAttribute('aria-pressed')).toBe('false');

    button('Hoje').click();
    fixture.detectChanges();
    expect(date.value).toBe(todayIso());
  });

  it('a dica da data muda por natureza: vence na data, entra na conta hoje, fica a receber até a data', async () => {
    const { el, fixture } = await setup();
    const hint = () => el.querySelector('[data-testid="date-hint"]')?.textContent?.trim();
    expect(hint()).toBe('Vence na data');

    income(el, fixture);
    expect(hint()).toBe('Entra na conta hoje');

    type(el, '#date', '2999-12-25');
    fixture.detectChanges();
    expect(hint()).toBe('Fica a receber até 25/12/2999');

    type(el, '#date', '2020-01-02');
    fixture.detectChanges();
    expect(hint()).toBe('Entra na conta na data informada');
  });

  it('despesa no cartão mostra a fatura em que entra', async () => {
    const { el, fixture } = await setup();
    chooseAccount(fixture, el, 2);
    type(el, '#date', '2026-11-12'); // depois do fechamento (dia 10)
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="date-hint"]')?.textContent).toContain('Entra na fatura que vence em 17/12/2026');
  });

  it('sem valor avisa e preserva o que foi digitado', async () => {
    const { fixture, el } = await setup({ tipo: 'receita' });
    type(el, '#description', 'Freela de novembro');
    submit(el);
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Informe o valor da receita.');
    expect((el.querySelector('#description') as HTMLInputElement).value).toBe('Freela de novembro');
  });

  it('receita é salva como avulsa na conta, com data e vencimento iguais, sem settled', async () => {
    const { fixture, el, http } = await setup({ tipo: 'receita' });
    type(el, 'gef-money-input input', '500000');
    type(el, '#description', 'Salário de novembro');
    type(el, '#date', '2026-11-05');
    chooseAccount(fixture, el, 1);

    submit(el);

    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).toEqual({
      description: 'Salário de novembro', recurrenceType: 'VARIABLE', totalAmount: '5000.00', accountId: 1, categoryId: 20,
      purchaseDate: '2026-11-05', firstDueDate: '2026-11-05',
    });
    post.flush({ id: 1 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    expect(store.get('gefinc.quick-income.category')).toBe('20');
    expect(store.has('gefinc.quick-expense.category')).toBe(false);
    expect(TestBed.inject(NoticeService).toasts()[0].message).toBe('Receita registrada.');
  });

  it('despesa fora do cartão envia o vencimento igual à data; no cartão não envia', async () => {
    const first = await setup();
    type(first.el, 'gef-money-input input', '2550');
    submit(first.el);
    const post = first.http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).toMatchObject({ recurrenceType: 'VARIABLE', totalAmount: '25.50', categoryId: 11 });
    expect(post.request.body.firstDueDate).toBe(post.request.body.purchaseDate);
    expect(post.request.body).not.toHaveProperty('settled');
    post.flush({ id: 2 }, { status: 201, statusText: 'Created' });
    await first.fixture.whenStable();
    expect(TestBed.inject(NoticeService).toasts()[0].message).toBe('Despesa registrada.');
  });

  it('despesa no cartão não envia firstDueDate', async () => {
    const { fixture, el, http } = await setup();
    chooseAccount(fixture, el, 2);
    type(el, 'gef-money-input input', '1000');
    submit(el);
    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body.accountId).toBe(2);
    expect(post.request.body).not.toHaveProperty('firstDueDate');
    post.flush({ id: 3 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
  });

  it('erro 422 do servidor no campo da conta aparece no formulário e preserva o digitado', async () => {
    const { fixture, el, http } = await setup({ tipo: 'receita' });
    type(el, 'gef-money-input input', '10000');
    type(el, '#description', 'Bônus');
    submit(el);
    http
      .expectOne({ method: 'POST', url: `${API}/transaction-groups` })
      .flush(
        { status: 422, errors: [{ field: 'accountId', message: 'Receita só pode entrar em conta.' }] },
        { status: 422, statusText: 'Unprocessable' },
      );
    fixture.detectChanges();

    expect(el.querySelector('gef-account-picker')?.parentElement?.textContent).toContain('Receita só pode entrar em conta.');
    expect((el.querySelector('#description') as HTMLInputElement).value).toBe('Bônus');
    expect((el.querySelector('gef-money-input input') as HTMLInputElement).value).toBe('100,00');
  });

  it('o rodapé não é fixo e não usa a área segura do sistema (o botão rola junto com o formulário)', async () => {
    const { el } = await setup();
    const form = el.querySelector('form') as HTMLFormElement;
    expect(form.className).toContain('pb-10');
    expect(form.className).not.toContain('sticky');
    expect(form.className).not.toContain('fixed');
    expect(el.querySelector('form button[type="submit"]')?.className).not.toContain('sticky');
    expect(el.innerHTML).not.toContain('safe-area-inset-bottom');
  });

  it('guarda um rascunho com a natureza escolhida', async () => {
    const { el, fixture } = await setup();
    income(el, fixture);
    type(el, '#description', 'Freela');
    fixture.detectChanges();

    TestBed.inject(DraftService).snapshotAll();
    const saved = JSON.parse(sessionStorage.getItem('gefinc:draft:quick-new') ?? '{}');
    expect(saved).toMatchObject({ kind: 'INCOME', description: 'Freela' });
  });

  it('retoma o rascunho, inclusive a natureza', async () => {
    sessionStorage.setItem(
      'gefinc:draft:quick-new',
      JSON.stringify({ kind: 'INCOME', amount: '120.00', description: 'Freela', accountId: 1, categoryId: 20, date: '2026-11-05' }),
    );
    const { el } = await setup();
    expect((el.querySelector('#kind-INCOME') as HTMLInputElement).checked).toBe(true);
    expect((el.querySelector('#description') as HTMLInputElement).value).toBe('Freela');
    expect((el.querySelector('gef-money-input input') as HTMLInputElement).value).toBe('120,00');
    expect((el.querySelector('#date') as HTMLInputElement).value).toBe('2026-11-05');
    expect(el.querySelector('#categoryId')?.textContent).toContain('Salário');
  });
});

describe('NewEntryPage - parcelamento no cartão', () => {
  async function setup(query: Record<string, string> = {}) {
    const ctx = configureMobileTesting([
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query), data: {} } } },
    ]);
    const fixture = TestBed.createComponent(NewEntryPage);
    fixture.detectChanges();
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }
  type Fixture = { detectChanges(): void };
  const submit = (el: HTMLElement) => (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
  const installments = (el: HTMLElement) => el.querySelector('#installments') as HTMLSelectElement | null;
  const modeButton = (el: HTMLElement, label: string) =>
    Array.from(el.querySelectorAll('[aria-label="Forma de informar"] button')).find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
  const summary = (el: HTMLElement) => el.querySelector('[data-testid="installment-summary"]')?.textContent?.trim();
  const pickKind = (el: HTMLElement, fixture: Fixture, kind: 'INCOME' | 'EXPENSE') => {
    (el.querySelector(`#kind-${kind}`) as HTMLInputElement).click();
    fixture.detectChanges();
  };
  /** Cartão Nubank (fecha 10, vence 17), compra em 05/11/2026 (antes do fechamento). */
  async function card10x(fixture: Fixture, el: HTMLElement, count: string, digits: string) {
    chooseAccount(fixture, el, 2);
    type(el, '#date', '2026-11-05');
    select(el, '#installments', count);
    fixture.detectChanges();
    type(el, 'gef-money-input input', digits);
    fixture.detectChanges();
  }

  beforeEach(() => {
    store.clear();
    sessionStorage.clear();
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('o campo Parcelas só aparece em despesa no cartão, com À vista e de 2x a 24x', async () => {
    const { el, fixture } = await setup();
    expect(installments(el)).toBeNull(); // conta bancária
    chooseAccount(fixture, el, 2);
    const field = installments(el) as HTMLSelectElement;
    expect(field).not.toBeNull();
    expect(el.querySelector('label[for="installments"]')?.textContent).toContain('Parcelas');
    const options = Array.from(field.options).map((o) => o.textContent?.trim());
    expect(options[0]).toBe('À vista (1x)');
    expect(options[1]).toBe('2x');
    expect(options[options.length - 1]).toBe('24x');
    expect(options).toHaveLength(24);
    expect(field.value).toBe('1');
    expect(modeButton(el, 'Valor da parcela')).toBeUndefined();
    expect(el.querySelector('[data-testid="installment-preview"]')).toBeNull();
  });

  it('receita e conta bancária não têm o campo; ao trocar, as parcelas voltam para 1x', async () => {
    const { el, fixture } = await setup();
    chooseAccount(fixture, el, 2);
    select(el, '#installments', '6');
    fixture.detectChanges();
    expect(modeButton(el, 'Valor da parcela')).toBeDefined();

    chooseAccount(fixture, el, 1);
    expect(installments(el)).toBeNull();
    expect(modeButton(el, 'Valor da parcela')).toBeUndefined();
    chooseAccount(fixture, el, 2);
    expect(installments(el)?.value).toBe('1');

    select(el, '#installments', '6');
    fixture.detectChanges();
    pickKind(el, fixture, 'INCOME');
    expect(installments(el)).toBeNull();
    pickKind(el, fixture, 'EXPENSE');
    chooseAccount(fixture, el, 2);
    expect(installments(el)?.value).toBe('1');
    expect(el.querySelector('label[for="installments"]')).not.toBeNull();
  });

  it('à vista no cartão mantém avulso, sem alternador, sem totalInstallments e com o toast atual', async () => {
    const { fixture, el, http } = await setup();
    chooseAccount(fixture, el, 2);
    type(el, 'gef-money-input input', '1000');
    submit(el);
    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).toMatchObject({ recurrenceType: 'VARIABLE', totalAmount: '10.00' });
    expect(post.request.body).not.toHaveProperty('totalInstallments');
    expect(post.request.body).not.toHaveProperty('firstDueDate');
    post.flush({ id: 3 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    expect(TestBed.inject(NoticeService).toasts()[0].message).toBe('Despesa registrada.');
  });

  it('10 parcelas de R$ 100,00: rótulo, resumo, prévia com faturas e envio do total de R$ 1.000,00', async () => {
    const { fixture, el, http } = await setup();
    await card10x(fixture, el, '10', '10000');

    expect(el.querySelector('gef-money-input')?.textContent).toContain('Valor da parcela');
    expect(modeButton(el, 'Valor da parcela').getAttribute('aria-pressed')).toBe('true');
    expect(modeButton(el, 'Valor total').getAttribute('aria-pressed')).toBe('false');
    expect(summary(el)).toBe('10 × R$ 100,00 = R$ 1.000,00');
    const preview = el.querySelector('[data-testid="installment-preview"]') as HTMLElement;
    expect(preview.textContent).toContain('1/10 · fatura de nov/2026 · vence 17/11 · R$ 100,00');
    expect(preview.textContent).toContain('10/10 · fatura de ago/2027 · vence 17/08 · R$ 100,00');
    const details = preview.querySelector('details') as HTMLElement;
    expect(details.querySelector('summary')?.textContent).toContain('Ver todas as parcelas');
    expect(details.querySelectorAll('li')).toHaveLength(8);
    expect(details.textContent).toContain('2/10 · fatura de dez/2026');
    expect(el.querySelector('[data-testid="date-hint"]')?.textContent).toBe('1ª parcela na fatura que vence em 17/11/2026');

    submit(el);
    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).toEqual({
      description: 'Outras despesas',
      recurrenceType: 'INSTALLMENT',
      totalAmount: '1000.00',
      totalInstallments: 10,
      accountId: 2,
      categoryId: 11,
      purchaseDate: '2026-11-05',
    });
    post.flush({ id: 9 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    expect(store.get('gefinc.quick-expense.account')).toBe('2');
    expect(TestBed.inject(NoticeService).toasts()[0].message).toBe('Despesa registrada em 10x.');
  });

  it('compra após o fechamento empurra a 1ª parcela para a fatura seguinte', async () => {
    const { fixture, el } = await setup();
    await card10x(fixture, el, '3', '10000');
    type(el, '#date', '2026-11-12');
    fixture.detectChanges();
    const preview = el.querySelector('[data-testid="installment-preview"]') as HTMLElement;
    expect(preview.textContent).toContain('1/3 · fatura de dez/2026 · vence 17/12');
    expect(preview.textContent).toContain('3/3 · fatura de fev/2027 · vence 17/02');
    expect(el.querySelector('[data-testid="date-hint"]')?.textContent).toBe('1ª parcela na fatura que vence em 17/12/2026');
  });

  it('com 2 parcelas a prévia mostra as duas linhas, sem "Ver todas"', async () => {
    const { fixture, el } = await setup();
    await card10x(fixture, el, '2', '10000');
    expect(el.querySelector('[data-testid="installment-preview"] details')).toBeNull();
    expect(el.querySelector('[data-testid="installment-preview"]')?.textContent).toContain('2/2');
  });

  it('modo valor total: o número digitado é o total, o rótulo muda e o resto aparece no resumo', async () => {
    const { fixture, el, http } = await setup();
    await card10x(fixture, el, '10', '33331'); // R$ 333,31
    modeButton(el, 'Valor total').click();
    fixture.detectChanges();

    expect(el.querySelector('gef-money-input')?.textContent).toContain('Valor total');
    expect((el.querySelector('gef-money-input input') as HTMLInputElement).value).toBe('333,31'); // não converte
    expect(summary(el)).toBe('9 × R$ 33,33 + 1 × R$ 33,34');
    expect(modeButton(el, 'Valor total').getAttribute('aria-pressed')).toBe('true');

    submit(el);
    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).toMatchObject({ recurrenceType: 'INSTALLMENT', totalAmount: '333.31', totalInstallments: 10 });
    expect(post.request.body).not.toHaveProperty('firstDueDate');
    post.flush({ id: 10 }, { status: 201, statusText: 'Created' });
  });

  it('modo total sem resto resume com o total e alternar de volta não converte o número', async () => {
    const { fixture, el } = await setup();
    await card10x(fixture, el, '4', '40000');
    modeButton(el, 'Valor total').click();
    fixture.detectChanges();
    expect(summary(el)).toBe('4 × R$ 100,00 = R$ 400,00');
    modeButton(el, 'Valor da parcela').click();
    fixture.detectChanges();
    expect((el.querySelector('gef-money-input input') as HTMLInputElement).value).toBe('400,00');
    expect(summary(el)).toBe('4 × R$ 400,00 = R$ 1.600,00');
  });

  it('total menor que R$ 0,01 por parcela é recusado no cliente, sem enviar', async () => {
    const { fixture, el, http } = await setup();
    await card10x(fixture, el, '10', '5'); // R$ 0,05
    modeButton(el, 'Valor total').click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="installment-preview"]')).toBeNull();
    expect(summary(el)).toBeUndefined();

    submit(el);
    fixture.detectChanges();
    http.expectNone({ method: 'POST', url: `${API}/transaction-groups` });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('O valor deve ter pelo menos R$ 0,01 por parcela.');
    expect((el.querySelector('gef-money-input input') as HTMLInputElement).value).toBe('0,05');
  });

  it('avisa quando as parcelas já nascem vencidas', async () => {
    const { fixture, el } = await setup();
    await card10x(fixture, el, '3', '10000');
    expect(el.querySelector('[data-testid="installment-overdue"]')).toBeNull();
    type(el, '#date', '2020-01-05');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="installment-overdue"]')?.textContent).toContain('já nascem vencidas');
  });

  it('erro 422 do servidor aparece inline e preserva o digitado e as parcelas', async () => {
    const { fixture, el, http } = await setup();
    await card10x(fixture, el, '10', '10000');
    submit(el);
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
    expect(installments(el)?.parentElement?.textContent).toContain('Informe de 1 a 120 parcelas.');
    expect(installments(el)?.value).toBe('10');
    expect((el.querySelector('gef-money-input input') as HTMLInputElement).value).toBe('100,00');
    expect(summary(el)).toBe('10 × R$ 100,00 = R$ 1.000,00');
  });

  it('o rascunho guarda as parcelas e o modo, e a retomada os restaura', async () => {
    const first = await setup();
    await card10x(first.fixture, first.el, '10', '10000');
    modeButton(first.el, 'Valor total').click();
    first.fixture.detectChanges();
    TestBed.inject(DraftService).snapshotAll();
    const saved = JSON.parse(sessionStorage.getItem('gefinc:draft:quick-new') ?? '{}');
    expect(saved).toMatchObject({ accountId: 2, installments: 10, amountMode: 'TOTAL', amount: '100.00' });
    TestBed.resetTestingModule();

    const { el } = await setup();
    expect(installments(el)?.value).toBe('10');
    expect(modeButton(el, 'Valor total').getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('gef-money-input')?.textContent).toContain('Valor total');
    expect(summary(el)).toBe('10 × R$ 10,00 = R$ 100,00');
  });

  it('rascunho antigo, sem parcelas, abre à vista no cartão e com o valor da parcela como padrão', async () => {
    sessionStorage.setItem(
      'gefinc:draft:quick-new',
      JSON.stringify({ kind: 'EXPENSE', amount: '50.00', description: 'Mercado', accountId: 2, categoryId: 11, date: '2026-11-05' }),
    );
    const { el, fixture } = await setup();
    expect(installments(el)?.value).toBe('1');
    expect(el.querySelector('gef-money-input')?.textContent).not.toContain('Valor da parcela');
    select(el, '#installments', '5');
    fixture.detectChanges();
    expect(modeButton(el, 'Valor da parcela').getAttribute('aria-pressed')).toBe('true');
    expect(summary(el)).toBe('5 × R$ 50,00 = R$ 250,00');
  });

  it('alternar o modo por toque ou mouse devolve o foco ao valor, para o teclado numérico seguir aberto', async () => {
    const { fixture, el } = await setup();
    document.body.appendChild(el);
    await card10x(fixture, el, '3', '10000');
    (el.querySelector('#description') as HTMLInputElement).focus();
    modeButton(el, 'Valor total').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    fixture.detectChanges();
    expect(modeButton(el, 'Valor total').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(el.querySelector('gef-money-input input'));
    el.remove();
  });

  it('devolver o foco ao valor não rola a tela (preventScroll), ao alternar o modo e ao escolher a natureza', async () => {
    const { fixture, el } = await setup();
    document.body.appendChild(el);
    await card10x(fixture, el, '3', '10000');
    const focus = jest.spyOn(HTMLInputElement.prototype, 'focus');

    modeButton(el, 'Valor total').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    fixture.detectChanges();
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(focus.mock.instances.at(-1)).toBe(el.querySelector('gef-money-input input'));

    focus.mockClear();
    (el.querySelector('gef-kind-switch') as HTMLElement).dispatchEvent(new Event('pointerdown', { bubbles: true }));
    (el.querySelector('#kind-INCOME') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });

    focus.mockRestore();
    el.remove();
  });

  it('alternar o modo pelo teclado ou leitor de tela mantém o foco no botão', async () => {
    const { fixture, el } = await setup();
    document.body.appendChild(el);
    await card10x(fixture, el, '3', '10000');
    const button = modeButton(el, 'Valor total');
    button.focus();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(button);
    el.remove();
  });

  it('os botões de modo e a prévia usam o tom neutro dos campos (sem verde nem azul de foco)', async () => {
    const { fixture, el } = await setup();
    await card10x(fixture, el, '3', '10000');
    expect(el.querySelector('#installments')?.className).toContain('gef-input');
    expect(el.querySelector('[data-testid="installment-preview"]')?.className).toContain('border-gefinc-border');
    expect(el.innerHTML).not.toContain('safe-area-inset-bottom');
  });

  it('ordem dos campos: natureza, valor, descrição, categoria, conta, parcelamento, data, resumo e salvar', async () => {
    const { fixture, el } = await setup();
    await card10x(fixture, el, '10', '10000');

    const form = el.querySelector('form') as HTMLFormElement;
    const order = ['gef-kind-switch', 'gef-money-input', '#description', '#categoryId', 'gef-account-picker', '[data-testid="installment-group"]', '#date', 'gef-installment-summary-card', 'button[type="submit"]'];
    const nodes = order.map((selector) => form.querySelector(selector) as HTMLElement);
    nodes.forEach((node, i) => {
      expect(node).not.toBeNull();
      if (i > 0) {
        expect(nodes[i - 1].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    });
  });

  it('o seletor "Valor da parcela / Valor total" fica no grupo Parcelamento, fora do campo de valor, com legenda', async () => {
    const { fixture, el } = await setup();
    await card10x(fixture, el, '10', '10000');

    const mode = el.querySelector('gef-amount-mode-switch') as HTMLElement;
    expect(mode.closest('gef-money-input')).toBeNull();
    expect(mode.closest('[data-testid="installment-group"]')?.querySelector('legend')?.textContent).toContain('Parcelamento');
    expect(mode.textContent).toContain('O valor digitado é');
    expect(mode.contains(el.querySelector('gef-money-input'))).toBe(false);
  });

  it('os componentes do formulário são de bloco (as margens do espaçamento valem) e a legenda não ganha a margem do grupo', async () => {
    const { fixture, el } = await setup();
    await card10x(fixture, el, '10', '10000');

    for (const selector of ['gef-kind-switch', 'gef-money-input', 'gef-account-picker', 'gef-amount-mode-switch', 'gef-installment-summary-card']) {
      expect((el.querySelector(selector) as HTMLElement).className).toContain('block');
    }
    const group = el.querySelector('[data-testid="installment-group"]') as HTMLElement;
    expect(group.className).not.toContain('space-y');
    expect(group.querySelector('legend')?.nextElementSibling?.className).toContain('space-y-4');
  });

  it('o card de resumo só aparece com 2 ou mais parcelas e valor', async () => {
    const { fixture, el } = await setup();
    chooseAccount(fixture, el, 2);
    type(el, 'gef-money-input input', '10000');
    fixture.detectChanges();
    expect(el.querySelector('gef-installment-summary-card section')).toBeNull();
    expect(el.querySelector('gef-amount-mode-switch')).toBeNull();

    select(el, '#installments', '3');
    fixture.detectChanges();
    expect(el.querySelector('gef-installment-summary-card section')).not.toBeNull();
    expect(el.querySelector('gef-installment-summary-card h3')?.textContent).toContain('Resumo do parcelamento');
  });

  it('o erro de mínimo por parcela aparece no card enquanto se digita, sem esperar o envio', async () => {
    const { fixture, el } = await setup();
    await card10x(fixture, el, '10', '5');
    modeButton(el, 'Valor total').click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="installment-error"]')?.textContent).toContain('O valor deve ter pelo menos R$ 0,01 por parcela.');
    expect(el.querySelector('form > p[role="alert"]')).toBeNull(); // o alerta global só vem no envio
  });

  it('a data fica em largura total, com os atalhos abaixo e a dica ligada ao campo', async () => {
    const { el } = await setup();
    const date = el.querySelector('#date') as HTMLInputElement;
    const hoje = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Hoje') as HTMLButtonElement;

    expect(date.className).not.toContain('flex-1');
    expect(date.compareDocumentPosition(hoje) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(date.getAttribute('aria-describedby')).toBe('date-hint');
    expect(el.querySelector('#date-hint')?.getAttribute('data-testid')).toBe('date-hint');
  });
});
