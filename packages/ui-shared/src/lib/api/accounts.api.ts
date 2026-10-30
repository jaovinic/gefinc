import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Account, AccountInput, AccountUpdate, AccountUsage } from '@gefinc/core-models';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.tokens';

/** Contas, dinheiro e cartões de crédito do usuário autenticado. */
@Injectable({ providedIn: 'root' })
export class AccountsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(includeInactive = false): Observable<Account[]> {
    const params = new HttpParams().set('includeInactive', includeInactive);
    return this.http.get<Account[]>(`${this.base}/accounts`, { params });
  }

  create(input: AccountInput): Observable<Account> {
    return this.http.post<Account>(`${this.base}/accounts`, input);
  }

  update(id: number, body: AccountUpdate): Observable<Account> {
    return this.http.put<Account>(`${this.base}/accounts/${id}`, body);
  }

  /** Prévia da exclusão: o que impede excluir a conta (lançamentos, faturas pagas, cartões, saldo inicial). */
  usage(id: number): Observable<AccountUsage> {
    return this.http.get<AccountUsage>(`${this.base}/accounts/${id}/usage`);
  }

  /** Exclui a conta; com dados relacionados o servidor responde 409 (`ACCOUNT_IN_USE`). */
  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/accounts/${id}`);
  }
}
