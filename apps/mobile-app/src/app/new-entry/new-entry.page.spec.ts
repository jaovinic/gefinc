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
import { ActivatedRoute } from '@angular/router';
import { API, chooseAccount, configureMobileTesting, type } from '../../test/testbed';
import { QuickExpensePage } from './quick-expense.page';

describe('QuickExpensePage (despesa e receita)', () => {
  async function setup(kind: 'expense' | 'income') {
    const ctx = configureMobileTesting([{ provide: ActivatedRoute, useValue: { snapshot: { data: { kind } } } }]);
    const fixture = TestBed.createComponent(QuickExpensePage);
    fixture.detectChanges();
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => store.clear());
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('despesa: título, categorias de despesa e seletor de conta com ícones', async () => {
    const { el } = await setup('expense');
    expect(el.querySelector('h1')?.textContent).toContain('Nova despesa');
    const categories = el.querySelector('#categoryId')?.textContent ?? '';
    expect(categories).toContain('Alimentação');
    expect(categories).not.toContain('Salário');
    expect(el.querySelector('gef-account-picker button[aria-haspopup] svg')).not.toBeNull();
  });

  it('receita: título, só categorias de receita e a categoria "Salário" já escolhida', async () => {
    const { el } = await setup('income');
    expect(el.querySelector('h1')?.textContent).toContain('Nova receita');
    const categories = el.querySelector('#categoryId')?.textContent ?? '';
    expect(categories).toContain('Salário');
    expect(categories).not.toContain('Alimentação');
    expect((el.querySelector('#categoryId') as HTMLSelectElement).selectedOptions[0].textContent).toContain('Salário');
  });

  it('receita sem valor avisa e preserva o que foi digitado', async () => {
    const { fixture, el } = await setup('income');
    type(el, '#description', 'Freela de novembro');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Informe o valor da receita.');
    expect((el.querySelector('#description') as HTMLInputElement).value).toBe('Freela de novembro');
  });

  it('receita é salva como lançamento avulso de receita na conta escolhida', async () => {
    const { fixture, el, http } = await setup('income');
    type(el, 'gef-money-input input', '500000');
    type(el, '#description', 'Salário de novembro');
    chooseAccount(fixture, el, 1);
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).toMatchObject({
      description: 'Salário de novembro', recurrenceType: 'VARIABLE', totalAmount: '5000.00', accountId: 1, categoryId: 20,
    });
    expect(post.request.body.firstDueDate).toBe(post.request.body.purchaseDate);
    post.flush({ id: 1 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    expect(store.get('gefinc.quick-income.category')).toBe('20');
    expect(store.has('gefinc.quick-expense.category')).toBe(false);
  });

  it('despesa continua sendo salva como antes', async () => {
    const { fixture, el, http } = await setup('expense');
    type(el, 'gef-money-input input', '2550');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).toMatchObject({ recurrenceType: 'VARIABLE', totalAmount: '25.50', categoryId: 11 });
    post.flush({ id: 2 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
  });
});
