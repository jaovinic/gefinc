import { HttpClient, HttpContext, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { API_BASE_URL, NoticeService, messageFor, toProblem } from '@gefinc/ui-shared';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import { NetworkStatus } from './network-status';
import { BYPASS_OFFLINE } from './offline-context';
import { PendingOp, PendingQueue } from './pending-queue';

export interface SyncResult {
  sent: number;
  rejected: number;
  /** Por que o envio parou antes do fim: sem conexão, ou erro passageiro que será tentado de novo. */
  stopped: 'offline' | 'retry' | null;
}

/**
 * Quanto uma tentativa de envio pode ficar sem resposta. Rede "conectada" sem internet (lie-fi) deixaria a
 * requisição pendurada e, com ela, o envio de toda a fila; passado o limite a tentativa é abortada, a
 * operação volta a pendente e é repetida depois, com a mesma chave (o servidor não duplica).
 */
export const SEND_TIMEOUT_MS = 30_000;

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 60_000;

/**
 * Envia as operações pendentes na ordem em que foram feitas. Cada uma leva a própria chave de
 * idempotência, então repetir o envio nunca registra duas vezes. Recusas definitivas do servidor (4xx,
 * inclusive `409 STALE_VERSION` de uma edição: nada é sobrescrito em silêncio) ficam na fila com o motivo,
 * para o usuário corrigir ou descartar; erros passageiros (rede, tempo esgotado, 5xx, 429) voltam para a fila
 * e são tentados de novo com espera crescente. Cada edição aplicada devolve a `version` nova do registro, que
 * passa às edições seguintes dele ainda na fila. Excluir o que já não existe (404) conta como feito.
 */
@Injectable({ providedIn: 'root' })
export class SyncEngine {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly queue = inject(PendingQueue);
  private readonly network = inject(NetworkStatus);
  private readonly notices = inject(NoticeService);

  readonly syncing = signal(false);

  private running: Promise<SyncResult> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;

  flush(): Promise<SyncResult> {
    this.running ??= this.run().finally(() => (this.running = null));
    return this.running;
  }

  private async run(): Promise<SyncResult> {
    if (!this.network.online()) {
      return { sent: 0, rejected: 0, stopped: 'offline' };
    }
    this.clearRetry();
    this.syncing.set(true);
    let sent = 0;
    let rejected = 0;
    let stopped: SyncResult['stopped'] = null;
    try {
      // Sempre a primeira pendente da fila: o que for enfileirado durante o envio sai na mesma rodada.
      for (;;) {
        const op = this.queue.ops().find((o) => o.state === 'PENDING');
        if (!op) {
          break;
        }
        await this.queue.markSending(op.id);
        try {
          const response = await firstValueFrom(
            this.http
              .request<unknown>(op.method ?? 'POST', `${this.base}${op.path}`, {
                body: op.body,
                headers: new HttpHeaders({ 'Idempotency-Key': op.id }),
                context: new HttpContext().set(BYPASS_OFFLINE, true),
              })
              .pipe(timeout({ first: SEND_TIMEOUT_MS })),
          );
          await this.queue.remove(op.id);
          await this.passVersions(op, response);
          sent++;
        } catch (error) {
          if (error instanceof TimeoutError) {
            await this.queue.markPending(op.id);
            stopped = 'retry';
            break;
          }
          const problem = toProblem(error);
          if (problem.status === 0 || !(error instanceof HttpErrorResponse)) {
            await this.queue.markPending(op.id);
            stopped = 'offline';
            break;
          }
          if (op.kind === 'DELETE_GROUP' && problem.status === 404) {
            await this.queue.remove(op.id);
            sent++;
            continue;
          }
          if (isTemporary(problem.status, problem.code)) {
            await this.queue.markPending(op.id);
            stopped = 'retry';
            break;
          }
          await this.queue.reject(op.id, messageFor(problem));
          rejected++;
        }
      }
    } finally {
      this.syncing.set(false);
    }
    if (sent > 0 || rejected > 0) {
      this.notices.dataChanged();
    }
    // "Sem conexão" com o aparelho ainda conectado (portal cativo, sem dados): nada avisará quando a internet
    // voltar, então tenta de novo sozinho. Com o aparelho desconectado, a volta da conexão dispara o envio.
    if (stopped === 'retry' || (stopped === 'offline' && this.network.online())) {
      this.scheduleRetry();
    } else {
      this.attempts = 0;
    }
    return { sent, rejected, stopped };
  }

  /**
   * A resposta traz a `version` nova do registro: as edições seguintes dele a herdam só se for a que guardam +1
   * (ver `followsVersion`); com salto (alteração em outro aparelho), não são reescritas e o servidor as recusa.
   * As ocorrências de um grupo não entram: editar o grupo não muda a `version` delas no servidor (atualização em
   * lote), então o valor que a fila guarda já é o certo, e qualquer diferença seria alteração de outro aparelho.
   */
  private async passVersions(op: PendingOp, response: unknown): Promise<void> {
    const body = response as { version?: unknown } | null;
    if (op.entity && body && typeof body === 'object' && typeof body.version === 'number') {
      await this.queue.rewriteVersion(op.entity, body.version);
    }
  }

  private scheduleRetry(): void {
    this.attempts++;
    const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (this.attempts - 1));
    this.retryTimer = setTimeout(() => void this.flush(), delay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}

/** Falhas que não dependem da operação: tentar de novo mais tarde pode dar certo. */
function isTemporary(status: number, code: string | null): boolean {
  return status === 401 || status === 429 || status >= 500 || (status === 409 && code === 'IDEMPOTENCY_IN_PROGRESS');
}
