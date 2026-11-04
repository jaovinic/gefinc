import { Component, computed, inject, signal } from '@angular/core';
import type { TransactionGroupInput } from '@gefinc/core-models';
import { ConfirmDialog, EmptyView, GroupForm, Sheet } from '@gefinc/ui-shared';
import { PendingOp, PendingQueue } from './pending-queue';
import { SyncEngine } from './sync-engine';

/** O servidor só reconhece o reenvio de uma operação por 7 dias; a partir de 6 o aviso aparece na pendência. */
const IDEMPOTENCY_WARNING_MS = 6 * 86_400_000;

/**
 * Pendências de envio: o que está esperando a conexão e o que o servidor recusou (com o motivo). Uma
 * recusada pode ser tentada de novo, corrigida (só lançamentos novos) ou descartada. Edição e exclusão
 * recusadas não se corrigem aqui: o motivo costuma ser versão desatualizada, e refazer pede os dados atuais.
 */
@Component({
  selector: 'gef-pending-list-page',
  imports: [ConfirmDialog, EmptyView, GroupForm, Sheet],
  template: `
    <section class="space-y-4">
      <h1 class="text-title-lg font-bold">Pendências de envio</h1>
      @if (ops().length === 0) {
        <gef-empty icon="check" title="Nenhuma pendência" hint="Tudo o que você registrou já foi enviado ao servidor." />
      }
      @if (waiting().length > 0) {
        <div data-testid="waiting" class="space-y-2">
          <h2 class="text-title-md font-semibold">Aguardando envio</h2>
          <ul class="space-y-2">
            @for (op of waiting(); track op.id) {
              <li class="gef-card p-3">
                <p class="font-medium">{{ op.label }}</p>
                <p class="text-caption text-gefinc-muted">Será enviado quando houver conexão.</p>
                @if (isOld(op)) {
                  <p class="text-caption text-gefinc-warning">Na fila há mais de 6 dias: depois do envio, confira se o resultado não ficou repetido.</p>
                }
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
              <li class="gef-card border-gefinc-danger/40 p-3">
                <p class="font-medium">{{ op.label }}</p>
                <p class="text-caption text-gefinc-danger">{{ op.error }}</p>
                @if (isChange(op)) {
                  <p class="text-caption text-gefinc-muted">Para refazer, descarte e repita a ação na lista atualizada.</p>
                }
                <div class="mt-2 flex flex-wrap gap-1">
                  <button type="button" class="gef-btn-sm" [attr.aria-label]="'Tentar de novo ' + op.label" (click)="retry(op)">Tentar de novo</button>
                  @if (op.kind === 'CREATE_GROUP') {
                    <button type="button" class="gef-btn-sm" [attr.aria-label]="'Corrigir ' + op.label" (click)="correcting.set(op)">Corrigir</button>
                  }
                  <button type="button" class="gef-btn-sm gef-btn-sm-danger" [attr.aria-label]="'Descartar ' + op.label" (click)="discarding.set(op)">Descartar</button>
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
    <gef-confirm-dialog
      [open]="discarding() !== null"
      heading="Descartar pendência"
      confirmLabel="Descartar lançamento"
      busyLabel="Descartando…"
      [busy]="discardBusy()"
      [error]="discardError()"
      (confirmed)="discard()"
      (cancelled)="closeDiscard()"
    >
      @if (discarding(); as op) {
        <p>Descartar <strong>"{{ op.label }}"</strong>? {{ op.kind === 'CREATE_GROUP' ? 'O lançamento ainda não enviado será perdido.' : 'A operação ainda não enviada será perdida.' }}</p>
      }
    </gef-confirm-dialog>
  `,
})
export class PendingListPage {
  private readonly queue = inject(PendingQueue);
  private readonly engine = inject(SyncEngine);

  protected readonly ops = this.queue.ops;
  protected readonly waiting = computed(() => this.ops().filter((o) => o.state !== 'REJECTED'));
  protected readonly rejected = computed(() => this.ops().filter((o) => o.state === 'REJECTED'));
  protected readonly correcting = signal<PendingOp | null>(null);
  /** Operação recusada cujo descarte aguarda confirmação (o item descartado não pode ser recuperado). */
  protected readonly discarding = signal<PendingOp | null>(null);
  protected readonly discardBusy = signal(false);
  protected readonly discardError = signal<string | null>(null);

  protected isOld(op: PendingOp): boolean {
    return Date.now() - op.createdAt > IDEMPOTENCY_WARNING_MS;
  }

  /** Edição ou exclusão de lançamento que já existe no servidor. */
  protected isChange(op: PendingOp): boolean {
    return op.kind === 'EDIT_TX' || op.kind === 'EDIT_GROUP' || op.kind === 'DELETE_GROUP';
  }

  protected bodyOf(op: PendingOp): TransactionGroupInput {
    return op.body as TransactionGroupInput;
  }

  protected async retry(op: PendingOp): Promise<void> {
    await this.queue.retry(op.id);
    void this.engine.flush();
  }

  protected closeDiscard(): void {
    if (!this.discardBusy()) {
      this.discarding.set(null);
      this.discardError.set(null);
    }
  }

  protected async discard(): Promise<void> {
    const op = this.discarding();
    if (!op || this.discardBusy()) {
      return;
    }
    this.discardBusy.set(true);
    this.discardError.set(null);
    try {
      await this.queue.remove(op.id);
      this.discarding.set(null);
    } catch {
      this.discardError.set('Não foi possível descartar. Tente novamente.');
    } finally {
      this.discardBusy.set(false);
    }
  }

  /** O lançamento corrigido foi enviado (ou enfileirado) pelo formulário: a versão recusada sai. */
  protected async corrected(op: PendingOp): Promise<void> {
    await this.queue.remove(op.id);
    this.correcting.set(null);
  }
}
