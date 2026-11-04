import { Injectable, inject, signal } from '@angular/core';
import type { Account, Category } from '@gefinc/core-models';
import type { Subscription } from 'rxjs';
import { AccountsApi } from './accounts.api';
import { CategoriesApi } from './categories.api';
import { DATA_FRESHNESS } from './data-freshness';
import { isOfflineProblem, messageFor, toProblem } from './problem';

/** Contas e categorias do usuário, carregadas uma vez e compartilhadas pelas telas (seletores e rótulos). */
@Injectable({ providedIn: 'root' })
export class ReferenceData {
  private readonly accountsApi = inject(AccountsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly freshness = inject(DATA_FRESHNESS);

  /** Todas as contas, inclusive inativas (para exibir lançamentos antigos). */
  readonly accounts = signal<Account[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loaded = signal(false);
  /** As contas já chegaram ao menos uma vez (do servidor ou da cópia local). */
  readonly accountsLoaded = signal(false);
  /** Mensagem da última carga das contas que falhou, quando ainda não há contas (ex.: primeiro uso sem conexão e sem cópia local). */
  readonly accountsError = signal<string | null>(null);
  /** A falha das contas é falta de conexão (e não erro do servidor): a tela mostra o aviso de "Sem conexão". */
  readonly accountsOffline = signal(false);
  /** De quando são as listas, se vieram da cópia local do aparelho (`null`: do servidor). */
  readonly staleSince = signal<Date | null>(null);

  private pending: Subscription[] = [];

  /** Recarrega as listas; se falhar (ex.: sem conexão), mantém as que já tinha. */
  refresh(): void {
    this.pending = this.pending.filter((s) => !s.closed);
    this.pending.push(
      this.accountsApi.list(true).subscribe({
        next: (list) => {
          this.accounts.set(list);
          this.accountsLoaded.set(true);
          this.accountsError.set(null);
          this.accountsOffline.set(false);
          this.staleSince.set(this.freshness());
        },
        error: (e: unknown) => {
          if (this.accountsLoaded()) {
            return;
          }
          const problem = toProblem(e);
          this.accountsError.set(messageFor(problem));
          this.accountsOffline.set(isOfflineProblem(problem));
        },
      }),
      this.categoriesApi.list().subscribe({
        next: (list) => {
          this.categories.set(list);
          this.loaded.set(true);
        },
        error: () => undefined,
      }),
    );
  }

  /** Esquece tudo (fim da sessão): o próximo usuário a entrar nunca vê as contas e categorias do anterior. */
  reset(): void {
    this.pending.forEach((s) => s.unsubscribe());
    this.pending = [];
    this.accounts.set([]);
    this.categories.set([]);
    this.loaded.set(false);
    this.accountsLoaded.set(false);
    this.accountsError.set(null);
    this.accountsOffline.set(false);
    this.staleSince.set(null);
  }

  /** Conta pelo id; cópias locais antigas podem não ter titular, ícone nem vínculo (o selo trata). */
  account(id: number): Account | undefined {
    return this.accounts().find((a) => a.id === id);
  }

  /** Cartões ligados a uma conta bancária. */
  cardsOf(bankAccountId: number): Account[] {
    return this.accounts().filter((a) => a.bankAccountId === bankAccountId);
  }

  accountName(id: number): string {
    return this.accounts().find((a) => a.id === id)?.name ?? '—';
  }

  category(id: number): Category | undefined {
    return this.categories().find((c) => c.id === id);
  }
}
