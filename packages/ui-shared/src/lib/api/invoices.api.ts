import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CashflowMonth, Invoice, InvoiceProjection, Money, Month } from '@gefinc/core-models';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.tokens';

/** Faturas de cartão, pagamentos de fatura, projeção e fluxo de caixa mensal. */
@Injectable({ providedIn: 'root' })
export class InvoicesApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  invoice(accountId: number, month: Month): Observable<Invoice> {
    return this.http.get<Invoice>(`${this.base}/accounts/${accountId}/invoices/${month}`);
  }

  pay(accountId: number, month: Month, amount: Money, paidAt: string): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.base}/accounts/${accountId}/invoices/${month}/payments`, {
      amount,
      paidAt,
    });
  }

  /** Paga a fatura pelo saldo restante total. */
  settle(accountId: number, month: Month, paidAt: string): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.base}/accounts/${accountId}/invoices/${month}/payments/settle`, {
      paidAt,
    });
  }

  undoPayment(paymentId: number): Observable<Invoice> {
    return this.http.delete<Invoice>(`${this.base}/invoice-payments/${paymentId}`);
  }

  projection(from: Month, months = 12, accountId?: number): Observable<InvoiceProjection> {
    let params = new HttpParams().set('from', from).set('months', months);
    if (accountId !== undefined) {
      params = params.set('accountId', accountId);
    }
    return this.http.get<InvoiceProjection>(`${this.base}/invoices/projection`, { params });
  }

  cashflow(from: Month, months = 12): Observable<CashflowMonth[]> {
    const params = new HttpParams().set('from', from).set('months', months);
    return this.http.get<CashflowMonth[]>(`${this.base}/cashflow`, { params });
  }
}
