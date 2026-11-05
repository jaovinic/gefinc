import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Month, Transfer, TransferInput, TransferPage, TransferUpdate } from '@gefinc/core-models';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.tokens';

export interface TransferFilter {
  month: Month;
  accountId?: number;
  page?: number;
  size?: number;
}

/** Cabeçalho `Idempotency-Key` (UUID por tentativa, reutilizado em reenvio), enviado só quando há chave. */
function idempotencyHeaders(key?: string): HttpHeaders {
  return key ? new HttpHeaders({ 'Idempotency-Key': key }) : new HttpHeaders();
}

/** Transferências de saldo entre contas bancárias e de dinheiro do usuário (não são receita nem despesa). */
@Injectable({ providedIn: 'root' })
export class TransfersApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(filter: TransferFilter): Observable<TransferPage> {
    let params = new HttpParams().set('month', filter.month);
    if (filter.accountId !== undefined && filter.accountId !== 0) {
      params = params.set('accountId', filter.accountId);
    }
    if (filter.page !== undefined) {
      params = params.set('page', filter.page);
    }
    if (filter.size !== undefined) {
      params = params.set('size', filter.size);
    }
    return this.http.get<TransferPage>(`${this.base}/transfers`, { params });
  }

  create(input: TransferInput, idempotencyKey?: string): Observable<Transfer> {
    return this.http.post<Transfer>(`${this.base}/transfers`, input, { headers: idempotencyHeaders(idempotencyKey) });
  }

  update(id: number, body: TransferUpdate, idempotencyKey?: string): Observable<Transfer> {
    return this.http.put<Transfer>(`${this.base}/transfers/${id}`, body, { headers: idempotencyHeaders(idempotencyKey) });
  }

  /** Excluir é estornar: o saldo das duas contas volta ao que era. */
  remove(id: number, idempotencyKey?: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/transfers/${id}`, { headers: idempotencyHeaders(idempotencyKey) });
  }
}
