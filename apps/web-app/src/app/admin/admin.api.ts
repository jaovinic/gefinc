import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { AdminSession, AdminUserDetail, AdminUserPage, RoleChangeRequest } from '@gefinc/core-models';
import { API_BASE_URL, CurrentUser, NoticeService, toProblem } from '@gefinc/ui-shared';
import { Observable, catchError, throwError } from 'rxjs';

/** Situação filtrável da lista de usuários (espelha o contrato de `GET /admin/users`). */
export type AdminUserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETION_PENDING' | 'ADMIN';
export type AdminUserSort = 'createdAt' | 'lastAccessAt';
export type AdminSortDirection = 'asc' | 'desc';

/** Parâmetros da lista; os ausentes ou vazios não vão na URL (o servidor assume os padrões). */
export interface AdminUserListParams {
  q?: string;
  status?: AdminUserStatus;
  sort?: AdminUserSort;
  dir?: AdminSortDirection;
  page?: number;
  size?: number;
}

/**
 * Cliente das rotas `/admin/**`. As recusas de regra (`ROOT_PROTECTED`, `LAST_ADMIN`,
 * `REAUTH_FAILED`...) chegam como 403/409/422 `problem+json` e seguem para a tela, que as mostra; o
 * painel nunca as confunde com sessão expirada (401). Já um `403 FORBIDDEN` genérico significa que o
 * perfil foi retirado no meio da sessão: o perfil guardado é descartado e recarregado, o usuário é
 * avisado e volta para `/`.
 */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly currentUser = inject(CurrentUser);
  private readonly notices = inject(NoticeService);
  private readonly router = inject(Router);

  /** Página de usuários (busca, filtro e ordenação no servidor). A lista não é auditada. */
  listUsers(params: AdminUserListParams = {}): Observable<AdminUserPage> {
    let query = new HttpParams();
    const q = params.q?.trim();
    if (q) {
      query = query.set('q', q);
    }
    if (params.status) {
      query = query.set('status', params.status);
    }
    if (params.sort) {
      query = query.set('sort', params.sort);
    }
    if (params.dir) {
      query = query.set('dir', params.dir);
    }
    if (params.page !== undefined) {
      query = query.set('page', params.page);
    }
    if (params.size !== undefined) {
      query = query.set('size', params.size);
    }
    return this.guarded(this.http.get<AdminUserPage>(`${this.base}/admin/users`, { params: query }));
  }

  /** Detalhe de um usuário. Cada abertura é registrada na auditoria pelo servidor. */
  getUser(id: number): Observable<AdminUserDetail> {
    return this.guarded(this.http.get<AdminUserDetail>(`${this.base}/admin/users/${id}`));
  }

  /** Concede (`ADMIN`) ou retira (`USER`) o perfil de administrador; exige a senha de quem pede. */
  setRole(userId: number, role: RoleChangeRequest['role'], password: string): Observable<void> {
    return this.guarded(this.http.put<void>(`${this.base}/admin/users/${userId}/role`, { role, password }));
  }

  /** Sessões abertas do usuário, com IP e dispositivo (dado pessoal, só para o painel). */
  listSessions(userId: number): Observable<AdminSession[]> {
    return this.guarded(this.http.get<AdminSession[]>(`${this.base}/admin/users/${userId}/sessions`));
  }

  /** Encerra uma sessão; vale na próxima ação do usuário. */
  revokeSession(userId: number, sessionId: string): Observable<void> {
    return this.guarded(this.http.delete<void>(`${this.base}/admin/users/${userId}/sessions/${sessionId}`));
  }

  /** Encerra todas as sessões do usuário. */
  revokeAllSessions(userId: number): Observable<void> {
    return this.guarded(this.http.delete<void>(`${this.base}/admin/users/${userId}/sessions`));
  }

  /** Suspende a conta; o motivo (1 a 500 caracteres) fica só na auditoria. */
  suspend(userId: number, reason: string): Observable<void> {
    return this.guarded(this.http.post<void>(`${this.base}/admin/users/${userId}/suspend`, { reason }));
  }

  /** Reativa a conta suspensa (a exclusão pendente, se houver, continua). */
  reactivate(userId: number): Observable<void> {
    return this.guarded(this.http.post<void>(`${this.base}/admin/users/${userId}/reactivate`, null));
  }

  /** Retira o bloqueio temporário por tentativas de login. */
  clearLoginLock(userId: number): Observable<void> {
    return this.guarded(this.http.delete<void>(`${this.base}/admin/users/${userId}/login-lock`));
  }

  private guarded<T>(request: Observable<T>): Observable<T> {
    return request.pipe(
      catchError((error: unknown) => {
        if (this.accessRevoked(error)) {
          this.currentUser.clear();
          this.currentUser.load();
          this.notices.toast('Seu acesso à administração foi retirado.');
          void this.router.navigateByUrl('/');
        }
        return throwError(() => error);
      }),
    );
  }

  private accessRevoked(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse)) {
      return false;
    }
    const problem = toProblem(error);
    return problem.status === 403 && problem.code === 'FORBIDDEN';
  }
}
