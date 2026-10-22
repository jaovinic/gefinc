import { Component, computed, inject, signal } from '@angular/core';
import type { TransactionGroupInput } from '@gefinc/core-models';
import { EmptyView, GroupForm, Sheet } from '@gefinc/ui-shared';
import { PendingOp, PendingQueue } from './pending-queue';
import { SyncEngine } from './sync-engine';

/**
 * Pendências de envio: o que está esperando a conexão e o que o servidor recusou (com o motivo). Uma
 * recusada pode ser tentada de novo, corrigida (lançamentos novos) ou descartada.
 */
@Component({
  selector: 'gef-pending-list-page',
  imports: [EmptyView, GroupForm, Sheet],
  template: `
    <section class="gef-page space-y-4">
      <h1 class="text-title-lg font-bold">Pendências de envio</h1>
      @if (ops().length === 0) {
        <gef-empty title="Nenhuma pendência" hint="Tudo o que você registrou já foi enviado ao servidor." />
      }
      @if (waiting().length > 0) {
        <div data-testid="waiting" class="space-y-2">
          <h2 class="text-title-md font-semibold">Aguardando envio</h2>
          <ul class="space-y-2">
            @for (op of waiting(); track op.id) {
              <li class="rounded-xl border border-gefinc-border bg-gefinc-surface p-3">
                <p class="font-medium">{{ op.label }}</p>
                <p class="text-caption text-gefinc-muted">Será enviado quando houver conexão.</p>
              </li>
            }
          </ul>
        </div>
      }
      @if (rejected().length > 0) {
        <div data-testid="rejected" class="space-y-2">
          <h2 class="text-title-md font-semibold text-gefinc-danger">Recusadas pelo servidor</h2>
          <ul class="space-y-2">
            @for (op of rejected(); track op.id) {
              <li class="rounded-xl border border-gefinc-danger/40 bg-gefinc-surface p-3">
                <p class="font-medium">{{ op.label }}</p>
                <p class="text-caption text-gefinc-danger">{{ op.error }}</p>
                <div class="mt-2 flex flex-wrap gap-1">
                  <button type="button" class="gef-link gef-action" [attr.aria-label]="'Tentar de novo ' + op.label" (click)="retry(op)">Tentar de novo</button>
                  @if (op.kind === 'CREATE_GROUP') {
                    <button type="button" class="gef-link gef-action" [attr.aria-label]="'Corrigir ' + op.label" (click)="correcting.set(op)">Corrigir</button>
                  }
                  <button type="button" class="gef-action text-gefinc-danger" [attr.aria-label]="'Descartar ' + op.label" (click)="discard(op)">Descartar</button>
                </div>
              </li>
            }
          </ul>
        </div>
      }
    </section>
    <gef-sheet heading="Corrigir lançamento" [open]="correcting() !== null" (closed)="correcting.set(null)">
      @if (correcting(); as op) {
        <gef-group-form [initial]="bodyOf(op)" (saved)="corrected(op)" (cancelled)="correcting.set(null)" />
      }
    </gef-sheet>
  `,
})
export class PendingListPage {
  private readonly queue = inject(PendingQueue);
  private readonly engine = inject(SyncEngine);

  protected readonly ops = this.queue.ops;
  protected readonly waiting = computed(() => this.ops().filter((o) => o.state !== 'REJECTED'));
  protected readonly rejected = computed(() => this.ops().filter((o) => o.state === 'REJECTED'));
  protected readonly correcting = signal<PendingOp | null>(null);

  protected bodyOf(op: PendingOp): TransactionGroupInput {
    return op.body as TransactionGroupInput;
  }

  protected async retry(op: PendingOp): Promise<void> {
    await this.queue.retry(op.id);
    void this.engine.flush();
  }

  protected async discard(op: PendingOp): Promise<void> {
    await this.queue.remove(op.id);
  }

  /** O lançamento corrigido foi enviado (ou enfileirado) pelo formulário: a versão recusada sai. */
  protected async corrected(op: PendingOp): Promise<void> {
    await this.queue.remove(op.id);
    this.correcting.set(null);
  }
}
