import { HttpErrorResponse, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { ERROR_CODES } from '@gefinc/core-models';
import { catchError, switchMap, throwError } from 'rxjs';
import { API_BASE_URL, CLIENT_KIND } from './api.tokens';
import { NoticeService } from './notice.service';
import { SessionService } from './session.service';
import { TokenStore } from './token-store';

/**
 * Envia o token de acesso, identifica o cliente web (cookie de refresh), renova a sessão uma vez
 * ao receber 401 e trata o conflito de edição (`409 STALE_VERSION`).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(API_BASE_URL);
  if (!req.url.startsWith(base)) {
    return next(req);
  }
  const store = inject(TokenStore);
  const session = inject(SessionService);
  const notices = inject(NoticeService);
  const kind = inject(CLIENT_KIND);

  const prepare = (request: HttpRequest<unknown>): HttpRequest<unknown> => {
    const token = store.accessToken();
    return request.clone({
      withCredentials: kind === 'web',
      setHeaders: {
        ...(kind === 'web' ? { 'X-Client': 'web' } : {}),
        ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  const isAuthEndpoint = req.url.startsWith(`${base}/auth/`) && !req.url.endsWith('/auth/logout');

  return next(prepare(req)).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }
      if (error.status === 401 && !isAuthEndpoint) {
        return retryAfterRefresh(req, error, next, prepare, session);
      }
      if (error.status === 409 && error.error?.code === ERROR_CODES.staleVersion) {
        notices.staleVersion();
      }
      return throwError(() => error);
    }),
  );
};

function retryAfterRefresh(
  req: HttpRequest<unknown>,
  original: HttpErrorResponse,
  next: HttpHandlerFn,
  prepare: (request: HttpRequest<unknown>) => HttpRequest<unknown>,
  session: SessionService,
) {
  return session.refresh().pipe(
    // Só a falha da renovação encerra a sessão; erros da nova tentativa seguem para o chamador.
    catchError(() => {
      session.expire();
      return throwError(() => original);
    }),
    switchMap(() => next(prepare(req))),
  );
}
