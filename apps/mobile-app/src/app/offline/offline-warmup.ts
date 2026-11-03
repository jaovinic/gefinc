import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, effect, inject, untracked } from '@angular/core';
import { App } from '@capacitor/app';
import type { Account } from '@gefinc/core-models';
import {
  AccountsApi,
  BalancesApi,
  CASHFLOW_MONTHS,
  CategoriesApi,
  DashboardApi,
  InvoicesApi,
  PROJECTION_MONTHS,
  SessionService,
  TRANSACTIONS_PAGE_SIZE,
  TransactionsApi,
} from '@gefinc/ui-shared';
import { currentMonth } from '@gefinc/utils';
import { Observable, firstValueFrom } from 'rxjs';
import { AppLockService } from '../lock/app-lock.service';
import { NetworkStatus } from './network-status';
import { UserScope } from './user-scope';

/** Intervalo mínimo entre dois aquecimentos completos. */
export const WARMUP_MIN_INTERVAL_MS = 15 * 60_000;
/** Espera até o aparelho ficar ocioso antes de começar. */
const IDLE_DELAY_MS = 1_000;
/** Cartões cujas faturas são aquecidas (as demais abrem normalmente com rede). */
const MAX_CARDS = 6;

/**
 * Aquecimento da cópia local: com rede, depois do login, ao voltar ao primeiro plano e ao reconectar (no
 * máximo a cada 15 minutos), busca as leituras que as abas usam para que, sem conexão, elas já tenham dados.
 *
 * Usa os mesmos serviços e parâmetros das telas (a chave da cópia é a URL completa), uma requisição por
 * vez e em ociosidade. A gravação na cópia é do interceptor offline (cifrada, por usuário, limite de
 * 20 MB). Não roda sem login, sem conexão nem com o app bloqueado.
 */
@Injectable({ providedIn: 'root' })
export class OfflineWarmup {
  private readonly session = inject(SessionService);
  private readonly network = inject(NetworkStatus);
  private readonly lock = inject(AppLockService);
  private readonly scope = inject(UserScope);
  private readonly accountsApi = inject(AccountsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly balancesApi = inject(BalancesApi);
  private readonly dashboardApi = inject(DashboardApi);
  private readonly transactionsApi = inject(TransactionsApi);
  private readonly invoicesApi = inject(InvoicesApi);

  /** Quando o último aquecimento completo terminou, por usuário. Sai da conta: zera (a cópia também é apagada). */
  private readonly lastRun = new Map<string, number>();
  private scheduled = false;
  private running = false;

  constructor() {
    effect(() => {
      const authenticated = this.session.authenticated();
      const ready = authenticated && this.network.online() && !this.lock.locked();
      untracked(() => {
        if (!authenticated) {
          this.lastRun.clear();
        } else if (ready) {
          this.request();
        }
      });
    });
  }

  /** Acompanha a volta ao primeiro plano; chamado uma vez na abertura do app. */
  async start(): Promise<void> {
    try {
      await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          this.request();
        }
      });
    } catch {
      // Sem o plugin (navegador), o login e a volta da conexão já disparam o aquecimento.
    }
  }

  /** Pede um aquecimento; ignora se não pode rodar agora, se já há um agendado ou em curso, ou se foi há pouco. */
  request(): void {
    if (this.scheduled || this.running || !this.eligible()) {
      return;
    }
    const user = this.scope.id();
    const last = user === null ? undefined : this.lastRun.get(user);
    if (last !== undefined && Date.now() - last < WARMUP_MIN_INTERVAL_MS) {
      return;
    }
    this.scheduled = true;
    const go = () => {
      this.scheduled = false;
      void this.run();
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(go, { timeout: IDLE_DELAY_MS * 10 });
    } else {
      setTimeout(go, IDLE_DELAY_MS);
    }
  }

  private eligible(): boolean {
    return this.session.authenticated() && this.network.online() && !this.lock.locked() && this.scope.id() !== null;
  }

  private async run(): Promise<void> {
    const user = this.scope.id();
    if (user === null || this.running || !this.eligible()) {
      return;
    }
    this.running = true;
    // Interrompe se algo mudou no caminho (saiu da conta, trocou de usuário, bloqueou, ficou sem conexão).
    const stillValid = () => this.scope.id() === user && this.eligible();
    let aborted = false;
    const read = async <T>(source: () => Observable<T>): Promise<T | null> => {
      if (aborted || !stillValid()) {
        aborted = true;
        return null;
      }
      try {
        return await firstValueFrom(source());
      } catch (error) {
        // Sem resposta do servidor: continuar só gastaria bateria; tenta de novo no próximo gatilho.
        if (error instanceof HttpErrorResponse && error.status === 0) {
          aborted = true;
        }
        return null;
      }
    };

    try {
      const month = currentMonth();
      const accounts = await read(() => this.accountsApi.list(true));
      await read(() => this.accountsApi.list(false));
      await read(() => this.categoriesApi.list());
      await read(() => this.balancesApi.get());
      await read(() => this.dashboardApi.dashboard(month));
      await read(() => this.transactionsApi.list({ month, page: 0, size: TRANSACTIONS_PAGE_SIZE }));
      await read(() => this.invoicesApi.cashflow(month, CASHFLOW_MONTHS));
      const cards = (accounts ?? []).filter((a: Account) => a.type === 'CREDIT_CARD').slice(0, MAX_CARDS);
      for (const card of cards) {
        await read(() => this.invoicesApi.invoice(card.id, month));
        await read(() => this.invoicesApi.projection(month, PROJECTION_MONTHS, card.id));
      }
      if (!aborted) {
        this.lastRun.set(user, Date.now());
      }
    } finally {
      this.running = false;
    }
  }
}
