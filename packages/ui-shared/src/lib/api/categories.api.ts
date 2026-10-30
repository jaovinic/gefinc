import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Category, CategoryInput, CategoryType, CategoryUsage } from '@gefinc/core-models';
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

  /** Prévia da exclusão: quantos lançamentos e grupos usam a categoria. */
  usage(id: number): Observable<CategoryUsage> {
    return this.http.get<CategoryUsage>(`${this.base}/categories/${id}/usage`);
  }

  /** Exclui a categoria; em uso o servidor responde 409 (`CATEGORY_IN_USE`) e nada é movido. */
  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/categories/${id}`);
  }
}
