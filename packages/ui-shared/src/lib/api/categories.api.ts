import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Category, CategoryInput, CategoryType } from '@gefinc/core-models';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.tokens';

/** Categorias de receita e de despesa do usuário autenticado. */
@Injectable({ providedIn: 'root' })
export class CategoriesApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(type?: CategoryType): Observable<Category[]> {
    const params = type ? new HttpParams().set('type', type) : new HttpParams();
    return this.http.get<Category[]>(`${this.base}/categories`, { params });
  }

  create(input: CategoryInput): Observable<Category> {
    return this.http.post<Category>(`${this.base}/categories`, input);
  }

  update(id: number, input: CategoryInput): Observable<Category> {
    return this.http.put<Category>(`${this.base}/categories/${id}`, input);
  }

  /** Exclui a categoria; em uso, informe `reassignTo` para mover os lançamentos antes. */
  remove(id: number, reassignTo?: number): Observable<void> {
    const params = reassignTo === undefined ? new HttpParams() : new HttpParams().set('reassignTo', reassignTo);
    return this.http.delete<void>(`${this.base}/categories/${id}`, { params });
  }
}
