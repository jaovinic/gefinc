import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import type {
  AdminSession,
  AdminUserDetail,
  AdminUserPage,
  AuditAction,
  AuditEntry,
  AuditPage,
  AuditResult,
  RoleChangeRequest,
} from '@gefinc/core-models';
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

/** Parâmetros da consulta da auditoria (`GET /admin/audit`); ausentes não vão na URL. */
export interface AdminAuditListParams {
  from?: string;
  to?: string;
  actorId?: number;
  targetUserId?: number;
  action?: AuditAction;
  result?: AuditResult;
  cursor?: string;
  limit?: number;
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

  /** Reenvia o e-mail de redefinição de senha (invalida links anteriores, mantém senha e sessões). */
  sendPasswordReset(userId: number): Observable<void> {
    return this.guarded(this.http.post<void>(`${this.base}/admin/users/${userId}/password-reset/send`, null));
  }

  /** Invalida a senha e todas as sessões e envia um novo link de redefinição; exige a senha do admin. */
  forcePasswordReset(userId: number, password: string): Observable<void> {
    return this.guarded(this.http.post<void>(`${this.base}/admin/users/${userId}/password-reset/force`, { password }));
  }

  /** Reenvia uma redefinição de senha que falhou no histórico de envios. */
  resendEmailDelivery(deliveryId: number): Observable<void> {
    return this.guarded(this.http.post<void>(`${this.base}/admin/email/deliveries/${deliveryId}/resend`, null));
  }

  /** Página da trilha de auditoria (somente leitura, paginada por cursor opaco). */
  listAudit(params: AdminAuditListParams = {}): Observable<AuditPage> {
    let query = new HttpParams();
    if (params.from?.trim()) {
      query = query.set('from', params.from.trim());
    }
    if (params.to?.trim()) {
      query = query.set('to', params.to.trim());
    }
    if (params.actorId !== undefined) {
      query = query.set('actorId', params.actorId);
    }
    if (params.targetUserId !== undefined) {
      query = query.set('targetUserId', params.targetUserId);
    }
    if (params.action) {
      query = query.set('action', params.action);
    }
    if (params.result) {
      query = query.set('result', params.result);
    }
    if (params.cursor?.trim()) {
      query = query.set('cursor', params.cursor.trim());
    }
    if (params.limit !== undefined) {
      query = query.set('limit', params.limit);
    }
    return this.guarded(this.http.get<AuditPage>(`${this.base}/admin/audit`, { params: query }));
  }

  /** Detalhe de um registro da auditoria (`GET /admin/audit/{auditId}`). */
  getAuditEntry(id: number): Observable<AuditEntry> {
    return this.guarded(this.http.get<AuditEntry>(`${this.base}/admin/audit/${id}`));
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
