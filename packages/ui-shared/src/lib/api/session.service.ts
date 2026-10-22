import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import type { Credentials, TokenResponse } from '@gefinc/core-models';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, tap } from 'rxjs';
import { API_BASE_URL, CLIENT_KIND, LOGIN_REDIRECT } from './api.tokens';
import { DraftService } from './draft.service';
import { TokenStore } from './token-store';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly kind = inject(CLIENT_KIND);
  private readonly store = inject(TokenStore);
  private readonly drafts = inject(DraftService);
  private readonly redirect = inject(LOGIN_REDIRECT, { optional: true });

  private refreshInFlight$: Observable<TokenResponse> | null = null;

  readonly authenticated = signal(false);

  /** Restaura a sessão na abertura: token guardado (mobile) ou renovação pelo cookie (web). */
  async restore(): Promise<void> {
    if (this.store.accessToken() === null && this.store.refreshToken() === null && this.kind === 'mobile') {
      this.authenticated.set(false);
      return;
    }
    if (this.store.accessToken() !== null) {
      this.authenticated.set(true);
      return;
    }
    try {
      await firstValueFrom(this.refresh());
    } catch {
      this.authenticated.set(false);
    }
  }

  login(credentials: Credentials): Observable<TokenResponse> {
    return this.http
      .post<TokenResponse>(`${this.base}/auth/login`, credentials, { headers: this.clientHeaders() })
      .pipe(tap((tokens) => this.accept(tokens)));
  }

  /** Renova a sessão; várias chamadas simultâneas compartilham uma única renovação. */
  refresh(): Observable<TokenResponse> {
    if (this.refreshInFlight$ === null) {
      const refreshToken = this.store.refreshToken();
      const body = this.kind === 'mobile' && refreshToken !== null ? { refreshToken } : {};
      this.refreshInFlight$ = this.http
        .post<TokenResponse>(`${this.base}/auth/refresh`, body, { headers: this.clientHeaders() })
        .pipe(
          tap((tokens) => this.accept(tokens)),
          finalize(() => (this.refreshInFlight$ = null)),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.refreshInFlight$;
  }

  logout(): Observable<void> {
    const refreshToken = this.store.refreshToken();
    const body = this.kind === 'mobile' && refreshToken !== null ? { refreshToken } : null;
    return this.http.post<void>(`${this.base}/auth/logout`, body, { headers: this.clientHeaders() }).pipe(
      catchError(() => of(undefined)),
      map(() => undefined),
      tap(() => this.clearLocal()),
    );
  }

  /** Encerra só a sessão local (a API já revogou os tokens, ex.: após pedir a exclusão da conta). */
  endLocalSession(): void {
    this.clearLocal();
  }

  /** A sessão se perdeu (renovação recusada): guarda os rascunhos e leva ao login. */
  expire(): void {
    this.drafts.snapshotAll();
    this.clearLocal();
    this.redirect?.();
  }

  clientHeaders(): HttpHeaders {
    return this.kind === 'web' ? new HttpHeaders({ 'X-Client': 'web' }) : new HttpHeaders();
  }

  private accept(tokens: TokenResponse): void {
    void this.store.save({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    this.authenticated.set(true);
  }

  private clearLocal(): void {
    void this.store.clear();
    this.authenticated.set(false);
  }
}
