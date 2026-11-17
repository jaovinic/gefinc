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
  EmailConfig,
  EmailDeliveryPage,
  EmailKind,
  EmailTestResult,
  Invitation,
  InvitationStatus,
  PendingEmailChange,
  RoleChangeRequest,
} from '@gefinc/core-models';
import { API_BASE_URL, CurrentUser, NoticeService, toProblem } from '@gefinc/ui-shared';
import { Observable, catchError, throwError } from 'rxjs';

/** Situação filtrável da lista de usuários (espelha o contrato de `GET /admin/users`). */
export type AdminUserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETION_PENDING' | 'ADMIN';
export type AdminUserSort = 'createdAt' | 'lastAccessAt';
export type AdminSortDirection = 'asc' | 'desc';
export type { Invitation as AdminInvitationView, InvitationStatus } from '@gefinc/core-models';

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

/** Parâmetros do histórico de envios (`GET /admin/email/deliveries`); ausentes não vão na URL. */
export interface AdminEmailDeliveryParams {
  status?: 'SENT' | 'FAILED';
  kind?: EmailKind;
  cursor?: string;
  limit?: number;
}

export interface EditableParameter {
  readonly key: 'SIGNUPS_OPEN' | 'MAINTENANCE_ENABLED' | 'MAINTENANCE_MESSAGE';
  readonly value: string;
  readonly updatedAt: string;
  readonly updatedBy?: { readonly userId?: number; readonly label: string };
  readonly editable: boolean;
}

export interface ReadOnlyParameter {
  readonly key: string;
  readonly value: string;
  readonly label: string;
  readonly editable: boolean;
}

export interface ParametersResponse {
  readonly editable: readonly EditableParameter[];
  readonly readOnly: readonly ReadOnlyParameter[];
}

export interface RevokeAllResult {
  readonly revoked: number;
}

export interface DeletionRequestInput {
  readonly reasonId: number;
  readonly justification: string;
  readonly mode: 'IMMEDIATE' | 'GRACE';
  readonly days?: number;
  readonly confirmEmail: string;
  readonly password: string;
}

export interface DeletionOutcome {
  readonly status: 'SCHEDULED' | 'EXECUTED';
  readonly dueAt: string | null;
  readonly noticeState: string;
}

export interface DeletionReason {
  readonly id: number;
  readonly name: string;
  readonly message: string;
  readonly active: boolean;
  readonly initial: boolean;
}

export interface DeletionReasonInput {
  readonly name: string;
  readonly message: string;
}

export interface PendingCommunication {
  readonly id: number;
  readonly kind: string;
  readonly targetLabel: string;
  readonly failureReason: string;
  readonly attempts: number;
  readonly createdAt: string;
  readonly retainedUntil: string | null;
}

export interface ResendPendingResult {
  readonly state: 'DELIVERED' | 'PENDING';
}

export interface AdminAlerts {
  readonly pendingCommunications: number;
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

  /** Altera o nome de exibição do usuário (efeito imediato). */
  renameUser(userId: number, name: string | null): Observable<AdminUserDetail> {
    return this.guarded(this.http.patch<AdminUserDetail>(`${this.base}/admin/users/${userId}`, { name }));
  }

  /** Lista convites de cadastro com filtro opcional por status. */
  listInvitations(status?: InvitationStatus): Observable<Invitation[]> {
    let params = new HttpParams();
    if (status) {
      params = params.set('status', status);
    }
    return this.guarded(this.http.get<Invitation[]>(`${this.base}/admin/invitations`, { params }));
  }

  /** Cria ou reenvia convite de cadastro para o e-mail informado. */
  createInvitation(email: string): Observable<Invitation> {
    return this.guarded(this.http.post<Invitation>(`${this.base}/admin/invitations`, { email }));
  }

  /** Reenvia convite pendente gerando novo link. */
  resendInvitation(id: number): Observable<void> {
    return this.guarded(this.http.post<void>(`${this.base}/admin/invitations/${id}/resend`, null));
  }

  /** Cancela convite pendente e zera o e-mail em claro. */
  cancelInvitation(id: number): Observable<void> {
    return this.guarded(this.http.delete<void>(`${this.base}/admin/invitations/${id}`));
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

  /** Solicita a troca do e-mail do usuário enviando o código numérico ao novo endereço. */
  requestEmailChange(userId: number, newEmail: string): Observable<PendingEmailChange> {
    return this.guarded(
      this.http.post<PendingEmailChange>(`${this.base}/admin/users/${userId}/email-change`, { newEmail }),
    );
  }

  /** Confirma a troca do e-mail do usuário com o código de 6 dígitos. */
  confirmEmailChange(userId: number, code: string): Observable<void> {
    return this.guarded(
      this.http.post<void>(`${this.base}/admin/users/${userId}/email-change/confirm`, { code }),
    );
  }

  /** Cancela a troca de e-mail pendente do usuário. */
  cancelEmailChange(userId: number): Observable<void> {
    return this.guarded(this.http.delete<void>(`${this.base}/admin/users/${userId}/email-change`));
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

  /** Configuração de envio de e-mail (nunca usuário nem senha). */
  getEmailConfig(): Observable<EmailConfig> {
    return this.guarded(this.http.get<EmailConfig>(`${this.base}/admin/email/config`));
  }

  /** Envia um e-mail de teste ao próprio administrador (resposta 200 mesmo se o envio falhar). */
  sendTestEmail(): Observable<EmailTestResult> {
    return this.guarded(this.http.post<EmailTestResult>(`${this.base}/admin/email/test`, null));
  }

  /** Histórico de envios dos últimos 90 dias, paginado por cursor opaco. */
  listEmailDeliveries(params: AdminEmailDeliveryParams = {}): Observable<EmailDeliveryPage> {
    let query = new HttpParams();
    if (params.status) {
      query = query.set('status', params.status);
    }
    if (params.kind) {
      query = query.set('kind', params.kind);
    }
    if (params.cursor) {
      query = query.set('cursor', params.cursor);
    }
    if (params.limit !== undefined) {
      query = query.set('limit', params.limit);
    }
    return this.guarded(this.http.get<EmailDeliveryPage>(`${this.base}/admin/email/deliveries`, { params: query }));
  }

  /** Consulta os parâmetros globais do sistema (editáveis e somente leitura). */
  getParameters(): Observable<ParametersResponse> {
    return this.guarded(this.http.get<ParametersResponse>(`${this.base}/admin/parameters`));
  }

  /** Abre ou fecha novos cadastros no sistema. */
  setSignupsOpen(open: boolean): Observable<void> {
    return this.guarded(this.http.put<void>(`${this.base}/admin/parameters/signups-open`, { open }));
  }

  /** Ativa ou desativa o modo de manutenção com mensagem personalizada. */
  setMaintenance(enabled: boolean, message?: string): Observable<void> {
    return this.guarded(this.http.put<void>(`${this.base}/admin/parameters/maintenance`, { enabled, message }));
  }

  /** Encerra todas as sessões do sistema exceto a do administrador e raízes. */
  revokeAllGlobalSessions(password: string, confirmWord: string): Observable<RevokeAllResult> {
    return this.guarded(
      this.http.post<RevokeAllResult>(`${this.base}/admin/sessions/revoke-all`, { password, confirmWord }),
    );
  }

  /** Solicita ou antecipa a exclusão de uma conta de usuário. */
  requestDeletion(userId: number, body: DeletionRequestInput): Observable<DeletionOutcome> {
    return this.guarded(
      this.http.post<DeletionOutcome>(`${this.base}/admin/users/${userId}/deletion`, body),
    );
  }

  /** Cancela a exclusão agendada de um usuário, restaurando o estado anterior exato. */
  cancelDeletion(userId: number): Observable<void> {
    return this.guarded(
      this.http.delete<void>(`${this.base}/admin/users/${userId}/deletion`),
    );
  }

  /** Lista os motivos de exclusão cadastrados no sistema (ativos e inativos). */
  listDeletionReasons(): Observable<DeletionReason[]> {
    return this.guarded(
      this.http.get<DeletionReason[]>(`${this.base}/admin/deletion-reasons`),
    );
  }

  /** Cadastra um novo motivo de exclusão com mensagem genérica. */
  createDeletionReason(input: DeletionReasonInput): Observable<DeletionReason> {
    return this.guarded(
      this.http.post<DeletionReason>(`${this.base}/admin/deletion-reasons`, input),
    );
  }

  /** Altera o nome ou a mensagem genérica de um motivo de exclusão. */
  updateDeletionReason(id: number, input: DeletionReasonInput): Observable<DeletionReason> {
    return this.guarded(
      this.http.put<DeletionReason>(`${this.base}/admin/deletion-reasons/${id}`, input),
    );
  }

  /** Desativa um motivo de exclusão (recusado se for o último ativo). */
  deactivateDeletionReason(id: number): Observable<void> {
    return this.guarded(
      this.http.post<void>(`${this.base}/admin/deletion-reasons/${id}/deactivate`, null),
    );
  }

  /** Reativa um motivo de exclusão anteriormente desativado. */
  activateDeletionReason(id: number): Observable<void> {
    return this.guarded(
      this.http.post<void>(`${this.base}/admin/deletion-reasons/${id}/activate`, null),
    );
  }

  /** Lista as comunicações de e-mail pendentes de envio após falhas. */
  listPendingCommunications(): Observable<PendingCommunication[]> {
    return this.guarded(
      this.http.get<PendingCommunication[]>(`${this.base}/admin/communications/pending`),
    );
  }

  /** Tenta reenviar uma comunicação pendente. */
  resendPendingCommunication(id: number): Observable<ResendPendingResult> {
    return this.guarded(
      this.http.post<ResendPendingResult>(`${this.base}/admin/communications/pending/${id}/resend`, null),
    );
  }

  /** Descarta uma comunicação pendente, apagando o endereço retido (auditado). */
  discardPendingCommunication(id: number): Observable<void> {
    return this.guarded(
      this.http.post<void>(`${this.base}/admin/communications/pending/${id}/discard`, null),
    );
  }

  /** Consulta os alertas operacionais do painel (ex: comunicações pendentes). */
  getAlerts(): Observable<AdminAlerts> {
    return this.guarded(
      this.http.get<AdminAlerts>(`${this.base}/admin/alerts`),
    );
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
