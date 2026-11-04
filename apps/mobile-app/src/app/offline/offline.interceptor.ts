import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import type { CategoryType, RecurrenceType, TransactionPage, TransactionStatus } from '@gefinc/core-models';
import { API_BASE_URL, NoticeService, ReferenceData } from '@gefinc/ui-shared';
import { formatBRL, isoToBR, todayIso } from '@gefinc/utils';
import { EMPTY, Observable, catchError, filter, from, of, switchMap, tap, throwError, timer } from 'rxjs';
import { BackgroundReads } from './background-reads';
import { CacheStore } from './cache-store';
import { NetworkStatus } from './network-status';
import { BYPASS_OFFLINE } from './offline-context';
import { OfflineState } from './offline-state';
import { OverlayQuery, applyPending } from './overlay';
import { NewPendingOp, PendingQueue } from './pending-queue';
import { UserScope } from './user-scope';

/** Operações que podem ser feitas sem conexão e enviadas depois (FR-029). */
function queueable(req: HttpRequest<unknown>, base: string): NewPendingOp | null {
  const path = req.url.slice(base.length).split('?')[0];
  if (req.method === 'POST') {
    if (path === '/transaction-groups') {
      const body = (req.body ?? {}) as { description?: string; totalInstallments?: number };
      const label = body.description ?? 'Lançamento';
      const installments = body.totalInstallments ?? 1;
      return { kind: 'CREATE_GROUP', method: 'POST', path, body: req.body, label: installments > 1 ? `${label} · ${installments}x` : label };
    }
    const match = /^\/transactions\/(\d+)\/(pay|unpay)$/.exec(path);
    if (match) {
      return {
        kind: match[2] === 'pay' ? 'PAY' : 'UNPAY',
        method: 'POST',
        path,
        body: req.body ?? null,
        label: match[2] === 'pay' ? `Pagamento do lançamento ${match[1]}` : `Desfazer pagamento do lançamento ${match[1]}`,
        entity: { type: 'TRANSACTION', id: Number(match[1]) },
      };
    }
    return null;
  }
  const tx = /^\/transactions\/(\d+)$/.exec(path);
  if (req.method === 'PATCH' && tx) {
    const body = (req.body ?? {}) as { amount?: string; dueDate?: string };
    const parts = [body.amount ? `valor ${formatBRL(body.amount)}` : null, body.dueDate ? `vencimento ${isoToBR(body.dueDate)}` : null].filter(Boolean);
    return {
      kind: 'EDIT_TX',
      method: 'PATCH',
      path,
      body: req.body,
      label: `Editar lançamento ${tx[1]}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`,
      entity: { type: 'TRANSACTION', id: Number(tx[1]) },
    };
  }
  const group = /^\/transaction-groups\/(\d+)$/.exec(path);
  if (req.method === 'PUT' && group) {
    const description = (req.body as { description?: string } | null)?.description;
    return {
      kind: 'EDIT_GROUP',
      method: 'PUT',
      path,
      body: req.body,
      label: description ? `Editar "${description}"` : `Editar lançamento do grupo ${group[1]}`,
      entity: { type: 'GROUP', id: Number(group[1]) },
    };
  }
  if (req.method === 'DELETE' && group) {
    // O `?confirm=true` exigido pelo servidor segue no caminho que será enviado.
    return {
      kind: 'DELETE_GROUP',
      method: 'DELETE',
      path: req.urlWithParams.slice(base.length),
      body: null,
      label: `Excluir lançamento do grupo ${group[1]}`,
      entity: { type: 'GROUP', id: Number(group[1]) },
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
 * enfileira criar, editar e excluir lançamento, pagar e desfazer; e recusa com um aviso as demais alterações.
 * A lista de lançamentos mostra por cima o efeito das operações ainda não enviadas.
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
  const background = inject(BackgroundReads);
  const notices = inject(NoticeService);
  const scope = inject(UserScope);

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
    return get(req, next, { cache, network, state, background, notices, scope }, overlay, base);
  }

  const op = queueable(req, base);
  if (op === null) {
    return network.online() ? next(req) : throwError(() => offlineRequired());
  }
  // A chave nasce já na primeira tentativa: se a resposta se perder com o servidor tendo registrado, o
  // reenvio da fila leva a mesma chave e o servidor devolve o resultado original, sem duplicar.
  const key = crypto.randomUUID();
  const enqueue = (attempted: boolean): Observable<HttpEvent<unknown>> =>
    from(queue.enqueue({ ...op, id: key, ...(attempted ? { attempted: true } : {}) })).pipe(switchMap(() => of(new HttpResponse({ status: 202, body: {} }))));
  const enqueueAndNotify = (attempted: boolean): Observable<HttpEvent<unknown>> =>
    enqueue(attempted).pipe(
      tap(() => {
        state.queued();
        state.mutated();
      }),
    );
  // Com operação do mesmo registro ainda na fila, a nova entra atrás dela (mesmo com conexão): enviar direto a
  // faria passar na frente e a mais antiga chegaria depois com a `version` velha.
  if (!network.online() || (op.entity !== undefined && queue.hasLive(op.entity))) {
    return enqueueAndNotify(false);
  }
  return next(req.clone({ setHeaders: { 'Idempotency-Key': key } })).pipe(
    tap((event) => event instanceof HttpResponse && state.mutated()),
    catchError((error: unknown) => (isNetworkError(error) ? enqueueAndNotify(true) : throwError(() => error))),
  );
};

/**
 * Quanto a rede pode demorar para responder uma leitura que tem cópia local. Passado isso (aparelho
 * "conectado" sem internet, ou servidor lento), a cópia responde. Sem cópia, a rede é aguardada sem limite.
 */
export const CACHE_FALLBACK_MS = 3_000;

/** Quanto tempo a leitura que perdeu para a cópia local segue viva em segundo plano antes de ser abandonada. */
export const BACKGROUND_READ_MAX_MS = 60_000;

interface ReadDeps {
  cache: CacheStore;
  network: NetworkStatus;
  state: OfflineState;
  background: BackgroundReads;
  notices: NoticeService;
  scope: UserScope;
}

function get(
  req: HttpRequest<unknown>,
  next: (r: HttpRequest<unknown>) => Observable<HttpEvent<unknown>>,
  { cache, network, state, background, notices, scope }: ReadDeps,
  overlay: (body: unknown) => unknown,
  base: string,
): Observable<HttpEvent<unknown>> {
  // Sem cópia: leitura de tela vira "sem dados salvos"; leitura que prepara uma alteração (impacto, uso, registro a editar)
  // continua dizendo que a ação precisa de conexão.
  const missing = (): HttpErrorResponse => (readsForAction(req, base) ? offlineRequired() : offlineNoData());
  const serve = (hit: { value: unknown; syncedAt: Date }): HttpResponse<unknown> => {
    state.markStale(hit.syncedAt);
    return new HttpResponse({ status: 200, body: overlay(hit.value) });
  };
  const fromCache = (): Observable<HttpEvent<unknown>> =>
    from(cache.get<unknown>(req.urlWithParams)).pipe(switchMap((hit) => (hit ? of(serve(hit)) : throwError(() => missing()))));

  if (!network.online()) {
    return fromCache();
  }
  // A resposta só pode ser guardada para quem pediu: se o usuário mudou no caminho, ela é descartada.
  const user = scope.id();
  const parsedUrl = new URL(req.urlWithParams, 'http://local');
  parsedUrl.searchParams.sort();
  const backgroundKey = `${user}|${parsedUrl.pathname}${parsedUrl.search}`;

  return new Observable<HttpEvent<unknown>>((subscriber) => {
    // A leitura perdeu para a cópia local mas segue viva: ao chegar, só renova a cópia e avisa as telas.
    let detached = false;
    let served: unknown;
    const live$ = next(req).pipe(
      tap((event) => {
        if (event instanceof HttpResponse && event.status >= 200 && event.status < 300) {
          if (user === null || scope.id() !== user) {
            // Usuário mudou no caminho: nada é guardado, e portanto nada fica "atualizado" nem avisa as telas.
            return;
          }
          state.markFresh();
          const stored = cache.put(req.urlWithParams, event.body);
          if (detached && JSON.stringify(event.body) !== JSON.stringify(served)) {
            // Só avisa se mudou algo; do contrário, recarregar a tela repetiria a espera sem trazer nada novo.
            void stored.then(() => notices.dataChanged()).catch(() => undefined);
          } else {
            void stored.catch(() => undefined);
          }
        }
      }),
      // A cópia guardada é a resposta original do servidor; o efeito das pendências é aplicado na saída.
      switchMap((event) => (event instanceof HttpResponse && event.status === 200 ? of(event.clone({ body: overlay(event.body) })) : of(event))),
      catchError((error: unknown) => (isNetworkError(error) ? (detached ? EMPTY : fromCache()) : throwError(() => error))),
    );

    // Rede lenta: se a resposta não chegar em CACHE_FALLBACK_MS e houver cópia local, a cópia responde. O pedido segue
    // vivo em segundo plano (um por endereço) para renovar a cópia; se já há um, este é cancelado.
    const fallback = timer(CACHE_FALLBACK_MS)
      .pipe(
        switchMap(() => from(cache.get<unknown>(req.urlWithParams))),
        filter((hit): hit is { value: unknown; syncedAt: Date } => hit !== null),
      )
      .subscribe({
        next: (hit) => {
          if (!background.has(backgroundKey)) {
            detached = true;
            served = hit.value;
            background.adopt(backgroundKey, live);
            live.add(timer(BACKGROUND_READ_MAX_MS).subscribe(() => live.unsubscribe()));
          } else {
            live.unsubscribe();
          }
          subscriber.next(serve(hit));
          subscriber.complete();
        },
        // Cópia ilegível (falha do armazenamento): é como não ter cópia, segue aguardando a rede.
        error: () => undefined,
      });
    const live = live$.subscribe({
      next: (event) => {
        if (detached) {
          return;
        }
        if (event instanceof HttpResponse) {
          fallback.unsubscribe();
        }
        subscriber.next(event);
      },
      error: (error: unknown) => {
        fallback.unsubscribe();
        if (!detached) {
          subscriber.error(error);
        }
      },
      complete: () => {
        fallback.unsubscribe();
        if (!detached) {
          subscriber.complete();
        }
      },
    });
    return () => {
      fallback.unsubscribe();
      if (!detached) {
        live.unsubscribe();
      }
    };
  });
}

/** Leituras que só existem para preparar uma alteração (confirmar exclusão, abrir a edição): sem conexão, a ação é que não cabe. */
function readsForAction(req: HttpRequest<unknown>, base: string): boolean {
  const path = req.url.slice(base.length).split('?')[0];
  return /\/(impact|usage)$/.test(path) || /^\/(transaction-groups|transactions)\/\d+$/.test(path);
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

/** Leitura sem conexão e sem cópia local: a tela mostra o aviso de "Sem conexão" em vez de um estado vazio. */
function offlineNoData(): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 0,
    statusText: 'Offline',
    error: { code: 'OFFLINE_NO_DATA', detail: 'Sem conexão e sem dados salvos desta tela' },
  });
}
