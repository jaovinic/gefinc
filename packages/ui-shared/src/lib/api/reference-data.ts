import { Injectable, inject, signal } from '@angular/core';
import type { Account, Category } from '@gefinc/core-models';
import { AccountsApi } from './accounts.api';
import { CategoriesApi } from './categories.api';

/** Contas e categorias do usuário, carregadas uma vez e compartilhadas pelas telas (seletores e rótulos). */
@Injectable({ providedIn: 'root' })
export class ReferenceData {
  private readonly accountsApi = inject(AccountsApi);
  private readonly categoriesApi = inject(CategoriesApi);

  /** Todas as contas, inclusive inativas (para exibir lançamentos antigos). */
  readonly accounts = signal<Account[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loaded = signal(false);

  refresh(): void {
    this.accountsApi.list(true).subscribe((list) => this.accounts.set(list));
    this.categoriesApi.list().subscribe((list) => {
      this.categories.set(list);
      this.loaded.set(true);
    });
  }

  accountName(id: number): string {
    return this.accounts().find((a) => a.id === id)?.name ?? '—';
  }

  category(id: number): Category | undefined {
    return this.categories().find((c) => c.id === id);
  }
}
