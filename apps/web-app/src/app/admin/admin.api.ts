import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { RoleChangeRequest } from '@gefinc/core-models';
import { API_BASE_URL, CurrentUser, NoticeService, toProblem } from '@gefinc/ui-shared';
import { Observable, catchError, throwError } from 'rxjs';

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

  /** Concede (`ADMIN`) ou retira (`USER`) o perfil de administrador; exige a senha de quem pede. */
  setRole(userId: number, role: RoleChangeRequest['role'], password: string): Observable<void> {
    return this.guarded(this.http.put<void>(`${this.base}/admin/users/${userId}/role`, { role, password }));
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
