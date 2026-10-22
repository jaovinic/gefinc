import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import type { Account, Category } from '@gefinc/core-models';

const ACCOUNT_KEY = 'gefinc.quick-expense.account';
const CATEGORY_KEY = 'gefinc.quick-expense.category';
const FALLBACK_CATEGORY = 'Outras despesas';

/**
 * Conta e categoria padrão do lançamento rápido: a última usada ou, sem histórico, a primeira conta
 * ativa e a categoria "Outras despesas". Isso evita toques extras no formulário (RNF03).
 */
@Injectable({ providedIn: 'root' })
export class QuickExpenseDefaults {
  private readonly lastAccount = signal(0);
  private readonly lastCategory = signal(0);

  async load(): Promise<void> {
    this.lastAccount.set(Number((await Preferences.get({ key: ACCOUNT_KEY })).value ?? 0));
    this.lastCategory.set(Number((await Preferences.get({ key: CATEGORY_KEY })).value ?? 0));
  }

  async remember(accountId: number, categoryId: number): Promise<void> {
    this.lastAccount.set(accountId);
    this.lastCategory.set(categoryId);
    await Preferences.set({ key: ACCOUNT_KEY, value: String(accountId) });
    await Preferences.set({ key: CATEGORY_KEY, value: String(categoryId) });
  }

  /** Escolhe os padrões entre as contas e categorias que ainda valem; zero quando não há opção. */
  resolve(accounts: Account[], categories: Category[]): { accountId: number; categoryId: number } {
    const usableAccounts = accounts.filter((a) => a.active);
    const expenseCategories = categories.filter((c) => c.type === 'EXPENSE');
    const account =
      usableAccounts.find((a) => a.id === this.lastAccount()) ?? usableAccounts[0];
    const category =
      expenseCategories.find((c) => c.id === this.lastCategory()) ??
      expenseCategories.find((c) => c.name === FALLBACK_CATEGORY) ??
      expenseCategories[0];
    return { accountId: account?.id ?? 0, categoryId: category?.id ?? 0 };
  }
}
