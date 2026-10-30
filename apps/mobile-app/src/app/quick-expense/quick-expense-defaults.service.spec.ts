const store = new Map<string, string>();

jest.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: jest.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
    set: jest.fn(async ({ key, value }: { key: string; value: string }) => void store.set(key, value)),
  },
}));

import { TestBed } from '@angular/core/testing';
import type { Account, Category } from '@gefinc/core-models';
import { QuickExpenseDefaults } from './quick-expense-defaults.service';

const accounts = [
  { id: 1, name: 'Itaú', type: 'CHECKING', active: true, version: 0 },
  { id: 2, name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, active: true, version: 0 },
  { id: 3, name: 'Antiga', type: 'CASH', active: false, version: 0 },
] as Account[];
const categories = [
  { id: 10, name: 'Alimentação', type: 'EXPENSE', colorHex: '#F97316' },
  { id: 11, name: 'Outras despesas', type: 'EXPENSE', colorHex: '#94A3B8' },
  { id: 20, name: 'Salário', type: 'INCOME', colorHex: '#00E599' },
] as Category[];

describe('QuickExpenseDefaults', () => {
  beforeEach(() => store.clear());

  it('sem histórico usa a primeira conta ativa e a categoria "Outras despesas"', async () => {
    const defaults = TestBed.inject(QuickExpenseDefaults);
    await defaults.load();
    expect(defaults.resolve(accounts, categories)).toEqual({ accountId: 1, categoryId: 11 });
  });

  it('lembra a última conta e categoria usadas, inclusive depois de reabrir o app', async () => {
    const first = TestBed.inject(QuickExpenseDefaults);
    await first.load();
    await first.remember(2, 10);

    const reopened = new QuickExpenseDefaults();
    await reopened.load();
    expect(reopened.resolve(accounts, categories)).toEqual({ accountId: 2, categoryId: 10 });
  });

  it('ignora padrão que não existe mais, está inativo ou é categoria de receita', async () => {
    const defaults = TestBed.inject(QuickExpenseDefaults);
    await defaults.load();
    await defaults.remember(3, 20); // conta inativa e categoria de receita

    expect(defaults.resolve(accounts, categories)).toEqual({ accountId: 1, categoryId: 11 });
    await defaults.remember(99, 98); // inexistentes
    expect(defaults.resolve(accounts, categories)).toEqual({ accountId: 1, categoryId: 11 });
  });

  it('sem "Outras despesas" cai na primeira categoria de despesa', async () => {
    const defaults = TestBed.inject(QuickExpenseDefaults);
    await defaults.load();
    expect(defaults.resolve(accounts, [categories[0], categories[2]]).categoryId).toBe(10);
  });

  it('sem contas ativas ou sem categorias devolve zero para o formulário pedir o cadastro', async () => {
    const defaults = TestBed.inject(QuickExpenseDefaults);
    await defaults.load();
    expect(defaults.resolve([], [])).toEqual({ accountId: 0, categoryId: 0 });
  });

  describe('receita', () => {
    it('sem histórico usa a primeira conta ativa e a categoria "Salário"', async () => {
      const defaults = TestBed.inject(QuickExpenseDefaults);
      await defaults.load('income');
      expect(defaults.resolve(accounts, categories, 'income')).toEqual({ accountId: 1, categoryId: 20 });
    });

    it('nunca escolhe cartão para receita, nem o último usado nem o primeiro da lista', async () => {
      const defaults = TestBed.inject(QuickExpenseDefaults);
      await defaults.load('income');
      await defaults.remember(2, 20, 'income'); // cartão lembrado (legado)
      expect(defaults.resolve(accounts, categories, 'income').accountId).toBe(1);
      expect(defaults.resolve([accounts[1]], categories, 'income').accountId).toBe(0);
      expect(defaults.resolve([accounts[1]], categories, 'expense').accountId).toBe(2);
    });

    it('os padrões de receita e de despesa são independentes', async () => {
      const defaults = TestBed.inject(QuickExpenseDefaults);
      await defaults.load('expense');
      await defaults.load('income');
      await defaults.remember(2, 10, 'expense');
      await defaults.remember(1, 20, 'income');
      expect(defaults.resolve(accounts, categories, 'expense')).toEqual({ accountId: 2, categoryId: 10 });
      expect(defaults.resolve(accounts, categories, 'income')).toEqual({ accountId: 1, categoryId: 20 });
    });

    it('ignora categoria de despesa lembrada para receita', async () => {
      const defaults = TestBed.inject(QuickExpenseDefaults);
      await defaults.load('income');
      await defaults.remember(1, 10, 'income');
      expect(defaults.resolve(accounts, categories, 'income').categoryId).toBe(20);
    });
  });
});
