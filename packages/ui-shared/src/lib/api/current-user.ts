import { HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import type { UserProfile } from '@gefinc/core-models';
import { Subscription, filter } from 'rxjs';
import { AuthApi } from './auth.api';

/** Nome para exibir: o nome cadastrado; sem ele, a parte do e-mail antes do @; sem nada, nulo. */
export function userDisplayName(name: string | null | undefined, email: string | null | undefined): string | null {
  const trimmedName = name?.trim();
  if (trimmedName) {
    return trimmedName;
  }
  const local = email?.split('@')[0]?.trim();
  return local ? local : null;
}

/** Inicial maiúscula do nome (ou do e-mail, sem nome); "?" quando não há nada. */
export function userInitial(name: string | null | undefined, email: string | null | undefined): string {
  return (name?.trim() || email?.trim() || '?').charAt(0).toUpperCase();
}

/**
 * Perfil de quem está logado, só em memória, para o atalho "Minha conta". Carrega sob demanda (uma
 * única chamada, mesmo pedida por vários componentes) e é esquecido ao encerrar a sessão.
 */
@Injectable({ providedIn: 'root' })
export class CurrentUser {
  private readonly api = inject(AuthApi);
  private request: Subscription | null = null;
  /** Falha de sessão (401/403): não adianta insistir sozinho; só um login novo (clear) libera. */
  private denied = false;

  constructor() {
    const win = inject(DOCUMENT).defaultView;
    const onOnline = (): void => this.retry();
    win?.addEventListener('online', onOnline);
    const navigation = inject(Router)
      .events.pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.retry());
    inject(DestroyRef).onDestroy(() => {
      win?.removeEventListener('online', onOnline);
      navigation.unsubscribe();
    });
  }

  readonly profile = signal<UserProfile | null>(null);
  /** A última tentativa de carregar falhou (sem rede, erro do servidor); a próxima chamada tenta de novo. */
  readonly failed = signal(false);

  readonly email = computed(() => this.profile()?.email ?? null);
  readonly displayName = computed(() => {
    const profile = this.profile();
    return profile ? userDisplayName(profile.name, profile.email) : null;
  });
  readonly initial = computed(() => {
    const profile = this.profile();
    return profile ? userInitial(profile.name, profile.email) : null;
  });

  /** Busca o perfil se ainda não está carregado nem em andamento. */
  load(): void {
    if (this.profile() !== null || this.request !== null) {
      return;
    }
    const request = new Subscription();
    this.request = request;
    request.add(
      this.api.me().subscribe({
        next: (profile) => this.apply(profile),
        error: (e: unknown) => {
          if (this.request === request) {
            this.request = null;
            this.denied = e instanceof HttpErrorResponse && (e.status === 401 || e.status === 403);
            this.failed.set(true);
          }
        },
        complete: () => {
          if (this.request === request) {
            this.request = null;
          }
        },
      }),
    );
  }

  /** Nova tentativa automática (volta da rede, troca de tela) só depois de falha e sem busca em andamento. */
  private retry(): void {
    if (this.failed() && !this.denied && this.request === null) {
      this.load();
    }
  }

  /** Grava o perfil já conhecido (ex.: devolvido ao salvar o nome) e descarta uma busca em andamento. */
  apply(profile: UserProfile): void {
    this.cancel();
    this.profile.set(profile);
    this.failed.set(false);
    this.denied = false;
  }

  /** Esquece tudo e cancela a busca pendente: uma resposta atrasada não pode vazar para o próximo usuário. */
  clear(): void {
    this.cancel();
    this.profile.set(null);
    this.failed.set(false);
    this.denied = false;
  }

  private cancel(): void {
    this.request?.unsubscribe();
    this.request = null;
  }
}
