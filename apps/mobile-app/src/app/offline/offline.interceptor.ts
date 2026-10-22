import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import type { CategoryType, RecurrenceType, TransactionPage, TransactionStatus } from '@gefinc/core-models';
import { API_BASE_URL, ReferenceData } from '@gefinc/ui-shared';
import { todayIso } from '@gefinc/utils';
import { Observable, catchError, from, of, switchMap, tap, throwError } from 'rxjs';
import { CacheStore } from './cache-store';
import { NetworkStatus } from './network-status';
import { BYPASS_OFFLINE } from './offline-context';
import { OfflineState } from './offline-state';
import { OverlayQuery, applyPending } from './overlay';
import { NewPendingOp, PendingQueue } from './pending-queue';

/** Operações que podem ser feitas sem conexão e enviadas depois (FR-029). */
function queueable(req: HttpRequest<unknown>, base: string): NewPendingOp | null {
  if (req.method !== 'POST') {
    return null;
  }
  const path = req.url.slice(base.length).split('?')[0];
  if (path === '/transaction-groups') {
    const body = (req.body ?? {}) as { description?: string };
    return { kind: 'CREATE_GROUP', path, body: req.body, label: body.description ?? 'Lançamento' };
  }
  const match = /^\/transactions\/(\d+)\/(pay|unpay)$/.exec(path);
  if (match) {
    return {
      kind: match[2] === 'pay' ? 'PAY' : 'UNPAY',
      path,
      body: req.body ?? null,
      label: match[2] === 'pay' ? `Pagamento do lançamento ${match[1]}` : `Desfazer pagamento do lançamento ${match[1]}`,
    };
  }
  return null;
}

const isNetworkError = (error: unknown): boolean => error instanceof HttpErrorResponse && error.status === 0;

function queryOf(req: HttpRequest<unknown>): OverlayQuery {
  const params = new URLSearchParams(req.urlWithParams.split('?')[1] ?? '');
  const number = (key: string) => (params.get(key) ? Number(params.get(key)) : undefined);
  return {
    month: params.get('month') ?? undefined,
    accountId: number('accountId'),
    categoryId: number('categoryId'),
    kind: (params.get('kind') as CategoryType | null) ?? undefined,
    status: (params.get('status') as TransactionStatus | null) ?? undefined,
    recurrenceType: (params.get('recurrenceType') as RecurrenceType | null) ?? undefined,
  };
}

/**
 * Modo offline do app: guarda as respostas de leitura (cópia local cifrada) e as usa sem conexão;
 * enfileira criar lançamento, pagar e desfazer; e recusa com um aviso as demais alterações. A lista de
 * lançamentos mostra por cima o efeito das operações ainda não enviadas.
 */
export const offlineInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(API_BASE_URL);
  if (!req.url.startsWith(base) || req.url.startsWith(`${base}/auth/`) || req.context.get(BYPASS_OFFLINE)) {
    return next(req);
  }
  const cache = inject(CacheStore);
  const queue = inject(PendingQueue);
  const network = inject(NetworkStatus);
  const state = inject(OfflineState);
  const reference = inject(ReferenceData);

  const overlay = (body: unknown): unknown => {
    if (!isTransactionList(req, base) || queue.ops().length === 0) {
      return body;
    }
    return applyPending(
      body as TransactionPage,
      queue.ops(),
      { accounts: reference.accounts(), categories: reference.categories(), today: todayIso() },
      queryOf(req),
    );
  };

  if (req.method === 'GET') {
    return get(req, next, cache, network, state, overlay);
  }

  const op = queueable(req, base);
  if (op === null) {
    return network.online() ? next(req) : throwError(() => offlineRequired());
  }
  // A chave nasce já na primeira tentativa: se a resposta se perder com o servidor tendo registrado, o
  // reenvio da fila leva a mesma chave e o servidor devolve o resultado original, sem duplicar.
  const key = crypto.randomUUID();
  const enqueue = (): Observable<HttpEvent<unknown>> =>
    from(queue.enqueue({ ...op, id: key })).pipe(switchMap(() => of(new HttpResponse({ status: 202, body: {} }))));
  const enqueueAndNotify = (): Observable<HttpEvent<unknown>> => enqueue().pipe(tap(() => state.mutated()));
  if (!network.online()) {
    return enqueueAndNotify();
  }
  return next(req.clone({ setHeaders: { 'Idempotency-Key': key } })).pipe(
    tap((event) => event instanceof HttpResponse && state.mutated()),
    catchError((error: unknown) => (isNetworkError(error) ? enqueueAndNotify() : throwError(() => error))),
  );
};

function get(
  req: HttpRequest<unknown>,
  next: (r: HttpRequest<unknown>) => Observable<HttpEvent<unknown>>,
  cache: CacheStore,
  network: NetworkStatus,
  state: OfflineState,
  overlay: (body: unknown) => unknown,
): Observable<HttpEvent<unknown>> {
  const fromCache = (original: unknown): Observable<HttpEvent<unknown>> =>
    from(cache.get<unknown>(req.urlWithParams)).pipe(
      switchMap((hit) => {
        if (!hit) {
          return throwError(() => original);
        }
        state.markStale(hit.syncedAt);
        return of(new HttpResponse({ status: 200, body: overlay(hit.value) }));
      }),
    );

  if (!network.online()) {
    return fromCache(offlineRequired());
  }
  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse && event.status >= 200 && event.status < 300) {
        state.markFresh();
        void cache.put(req.urlWithParams, event.body);
      }
    }),
    // A cópia guardada é a resposta original do servidor; o efeito das pendências é aplicado na saída.
    switchMap((event) => (event instanceof HttpResponse && event.status === 200 ? of(event.clone({ body: overlay(event.body) })) : of(event))),
    catchError((error: unknown) => (isNetworkError(error) ? fromCache(error) : throwError(() => error))),
  );
}

function isTransactionList(req: HttpRequest<unknown>, base: string): boolean {
  return req.method === 'GET' && req.url.split('?')[0] === `${base}/transactions`;
}

function offlineRequired(): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 0,
    statusText: 'Offline',
    error: { code: 'OFFLINE_REQUIRES_CONNECTION', detail: 'Esta ação precisa de conexão com a internet.' },
  });
}
