import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CategoryType,
  GroupImpact,
  Money,
  Month,
  RecurrenceType,
  Transaction,
  TransactionGroupDetail,
  TransactionGroupInput,
  TransactionGroupUpdate,
  TransactionPage,
  TransactionPatch,
  TransactionStatus,
} from '@gefinc/core-models';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from './api.tokens';

export interface TransactionFilter {
  month?: Month;
  accountId?: number;
  categoryId?: number;
  kind?: CategoryType;
  recurrenceType?: RecurrenceType;
  status?: TransactionStatus;
  page?: number;
  size?: number;
}

/** Cabeçalho `Idempotency-Key`, enviado só quando há chave (o web não usa). */
function idempotencyHeaders(key?: string): HttpHeaders {
  return key ? new HttpHeaders({ 'Idempotency-Key': key }) : new HttpHeaders();
}

/** Lançamentos: grupos (avulso, fixo, parcelado) e suas ocorrências. */
@Injectable({ providedIn: 'root' })
export class TransactionsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(filter: TransactionFilter = {}): Observable<TransactionPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filter)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return this.http.get<TransactionPage>(`${this.base}/transactions`, { params });
  }

  get(id: number): Observable<Transaction> {
    return this.http.get<Transaction>(`${this.base}/transactions/${id}`);
  }

  patch(id: number, body: TransactionPatch): Observable<Transaction> {
    return this.http.patch<Transaction>(`${this.base}/transactions/${id}`, body);
  }

  /** `idempotencyKey` (UUID) é usado pelo app ao reenviar operações feitas offline. */
  pay(id: number, paymentDate: string, idempotencyKey?: string): Observable<Transaction> {
    return this.http.post<Transaction>(
      `${this.base}/transactions/${id}/pay`,
      { paymentDate },
      { headers: idempotencyHeaders(idempotencyKey) },
    );
  }

  unpay(id: number, idempotencyKey?: string): Observable<Transaction> {
    return this.http.post<Transaction>(`${this.base}/transactions/${id}/unpay`, null, {
      headers: idempotencyHeaders(idempotencyKey),
    });
  }

  createGroup(input: TransactionGroupInput, idempotencyKey?: string): Observable<TransactionGroupDetail> {
    return this.http.post<TransactionGroupDetail>(`${this.base}/transaction-groups`, input, {
      headers: idempotencyHeaders(idempotencyKey),
    });
  }

  getGroup(id: number): Observable<TransactionGroupDetail> {
    return this.http.get<TransactionGroupDetail>(`${this.base}/transaction-groups/${id}`);
  }

  updateGroup(id: number, body: TransactionGroupUpdate): Observable<TransactionGroupDetail> {
    return this.http.put<TransactionGroupDetail>(`${this.base}/transaction-groups/${id}`, body);
  }

  groupImpact(id: number): Observable<GroupImpact> {
    return this.http.get<GroupImpact>(`${this.base}/transaction-groups/${id}/impact`);
  }

  /** Emite `true` quando a exclusão só foi guardada (resposta 202, app móvel sem conexão) e `false` quando o servidor a aplicou. */
  deleteGroup(id: number): Observable<boolean> {
    const params = new HttpParams().set('confirm', true);
    return this.http
      .delete<void>(`${this.base}/transaction-groups/${id}`, { params, observe: 'response' })
      .pipe(map((response) => response.status === 202));
  }

  changeAmount(id: number, fromMonth: Month, amount: Money): Observable<TransactionGroupDetail> {
    return this.http.post<TransactionGroupDetail>(`${this.base}/transaction-groups/${id}/amount-changes`, {
      fromMonth,
      amount,
    });
  }

  endGroup(id: number, endMonth: Month): Observable<TransactionGroupDetail> {
    return this.http.post<TransactionGroupDetail>(`${this.base}/transaction-groups/${id}/end`, { endMonth });
  }
}
