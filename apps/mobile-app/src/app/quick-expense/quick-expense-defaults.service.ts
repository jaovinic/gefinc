import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import type { Account, Category } from '@gefinc/core-models';
import { isAccountAllowed } from '@gefinc/ui-shared';

/** Natureza do lançamento rápido. */
export type QuickKind = 'expense' | 'income';

const KEYS: Record<QuickKind, { account: string; category: string }> = {
  expense: { account: 'gefinc.quick-expense.account', category: 'gefinc.quick-expense.category' },
  income: { account: 'gefinc.quick-income.account', category: 'gefinc.quick-income.category' },
};
const FALLBACK_CATEGORY: Record<QuickKind, string> = { expense: 'Outras despesas', income: 'Salário' };
const CATEGORY_TYPE = { expense: 'EXPENSE', income: 'INCOME' } as const;

/**
 * Conta e categoria padrão do lançamento rápido, separados por natureza: a última usada ou, sem
 * histórico, a primeira conta ativa (em receita, nunca um cartão) e a categoria "Outras despesas" (despesa) ou "Salário" (receita).
 * Isso evita toques extras no formulário (RNF03).
 */
@Injectable({ providedIn: 'root' })
export class QuickExpenseDefaults {
  private readonly lastAccount = { expense: signal(0), income: signal(0) };
  private readonly lastCategory = { expense: signal(0), income: signal(0) };

  async load(kind: QuickKind = 'expense'): Promise<void> {
    this.lastAccount[kind].set(Number((await Preferences.get({ key: KEYS[kind].account })).value ?? 0));
    this.lastCategory[kind].set(Number((await Preferences.get({ key: KEYS[kind].category })).value ?? 0));
  }

  async remember(accountId: number, categoryId: number, kind: QuickKind = 'expense'): Promise<void> {
    this.lastAccount[kind].set(accountId);
    this.lastCategory[kind].set(categoryId);
    await Preferences.set({ key: KEYS[kind].account, value: String(accountId) });
    await Preferences.set({ key: KEYS[kind].category, value: String(categoryId) });
  }

  /** Escolhe os padrões entre as contas e categorias que ainda valem; zero quando não há opção. */
  resolve(accounts: Account[], categories: Category[], kind: QuickKind = 'expense'): { accountId: number; categoryId: number } {
    // Receita só entra em conta (nunca em cartão); a última conta usada vale se ainda for aceita.
    const usableAccounts = accounts.filter((a) => a.active && isAccountAllowed(CATEGORY_TYPE[kind], a));
    const ofKind = categories.filter((c) => c.type === CATEGORY_TYPE[kind]);
    const account = usableAccounts.find((a) => a.id === this.lastAccount[kind]()) ?? usableAccounts[0];
    const category =
      ofKind.find((c) => c.id === this.lastCategory[kind]()) ??
      ofKind.find((c) => c.name === FALLBACK_CATEGORY[kind]) ??
      ofKind[0];
    return { accountId: account?.id ?? 0, categoryId: category?.id ?? 0 };
  }
}
