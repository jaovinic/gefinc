import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Balances } from '@gefinc/core-models';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.tokens';

/** Saldo por conta e saldo geral (soma das contas) até hoje. */
@Injectable({ providedIn: 'root' })
export class BalancesApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  get(): Observable<Balances> {
    return this.http.get<Balances>(`${this.base}/balances`);
  }
}
