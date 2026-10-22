import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { DueSummary } from '@gefinc/core-models';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.tokens';

/** Contagem de vencimentos por dia (sem valores nem nomes), usada pelos lembretes do app. */
@Injectable({ providedIn: 'root' })
export class DueSummaryApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /** `from` e `to` em ISO (AAAA-MM-DD), até 62 dias. */
  get(from: string, to: string): Observable<DueSummary> {
    return this.http.get<DueSummary>(`${this.base}/due-summary`, {
      params: new HttpParams().set('from', from).set('to', to),
    });
  }
}
