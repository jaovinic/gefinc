import { HttpClient, HttpContext, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { API_BASE_URL, NoticeService, messageFor, toProblem } from '@gefinc/ui-shared';
import { firstValueFrom } from 'rxjs';
import { NetworkStatus } from './network-status';
import { BYPASS_OFFLINE } from './offline-context';
import { PendingQueue } from './pending-queue';

export interface SyncResult {
  sent: number;
  rejected: number;
  /** Por que o envio parou antes do fim: sem conexão, ou erro passageiro que será tentado de novo. */
  stopped: 'offline' | 'retry' | null;
}

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 60_000;

/**
 * Envia as operações pendentes na ordem em que foram feitas. Cada uma leva a própria chave de
 * idempotência, então repetir o envio nunca registra duas vezes. Recusas definitivas do servidor (4xx)
 * ficam na fila com o motivo, para o usuário corrigir ou descartar; erros passageiros (rede, 5xx, 429)
 * voltam para a fila e são tentados de novo com espera crescente.
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
      for (const op of this.queue.ops().filter((o) => o.state === 'PENDING')) {
        await this.queue.markSending(op.id);
        try {
          await firstValueFrom(
            this.http.post(`${this.base}${op.path}`, op.body, {
              headers: new HttpHeaders({ 'Idempotency-Key': op.id }),
              context: new HttpContext().set(BYPASS_OFFLINE, true),
            }),
          );
          await this.queue.remove(op.id);
          sent++;
        } catch (error) {
          const problem = toProblem(error);
          if (problem.status === 0 || !(error instanceof HttpErrorResponse)) {
            await this.queue.markPending(op.id);
            stopped = 'offline';
            break;
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
    if (stopped === 'retry') {
      this.scheduleRetry();
    } else {
      this.attempts = 0;
    }
    return { sent, rejected, stopped };
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
