import { HttpClient, HttpParams } from '@angular/common/http';
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
import { Observable } from 'rxjs';
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

  pay(id: number, paymentDate: string): Observable<Transaction> {
    return this.http.post<Transaction>(`${this.base}/transactions/${id}/pay`, { paymentDate });
  }

  unpay(id: number): Observable<Transaction> {
    return this.http.post<Transaction>(`${this.base}/transactions/${id}/unpay`, null);
  }

  createGroup(input: TransactionGroupInput): Observable<TransactionGroupDetail> {
    return this.http.post<TransactionGroupDetail>(`${this.base}/transaction-groups`, input);
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

  deleteGroup(id: number): Observable<void> {
    const params = new HttpParams().set('confirm', true);
    return this.http.delete<void>(`${this.base}/transaction-groups/${id}`, { params });
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
