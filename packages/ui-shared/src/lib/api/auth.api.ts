import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Credentials, RegisterRequest, UserProfile } from '@gefinc/core-models';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.tokens';

/** Chamadas de conta e acesso que não dependem de sessão (cadastro, recuperação e exclusão). */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  register(body: RegisterRequest): Observable<UserProfile> {
    return this.http.post<UserProfile>(`${this.base}/auth/register`, body);
  }

  requestPasswordReset(email: string): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/password-reset/request`, { email });
  }

  confirmPasswordReset(token: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/password-reset/confirm`, { token, newPassword });
  }

  /** Agenda a exclusão da conta (carência de 30 dias); devolve a data limite para desistir. */
  requestAccountDeletion(password: string): Observable<{ deletionDate: string }> {
    return this.http.post<{ deletionDate: string }>(`${this.base}/auth/account-deletion`, { password });
  }

  cancelAccountDeletion(credentials: Credentials): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/account-deletion/cancel`, credentials);
  }
}
