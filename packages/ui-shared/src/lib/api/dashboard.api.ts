import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Dashboard, Month } from '@gefinc/core-models';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.tokens';

/** Painel do mês (por mês de vencimento). */
@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  dashboard(month: Month): Observable<Dashboard> {
    return this.http.get<Dashboard>(`${this.base}/dashboard`, { params: new HttpParams().set('month', month) });
  }
}
