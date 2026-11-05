import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Transfer } from '@gefinc/core-models';
import { currentMonth, formatBRL, isoToBR } from '@gefinc/utils';
import { transferableAccounts } from '../accounts/account-rules';
import { DATA_FRESHNESS, NoticeService, ReferenceData, TRANSFERS_PAGE_SIZE, TransfersApi, formatSyncedAt, isOfflineProblem, messageFor, toProblem } from '../api';
import { Icon } from '../icons/icon';
import { ConfirmDialog } from '../layout/confirm-dialog';
import { Sheet } from '../layout/sheet';
import { MonthPicker } from '../month-picker/month-picker';
import { Select, type SelectOption } from '../select/select';
import { EmptyView, ErrorView, LoadingView } from '../state-views/state-views';
import { Viewport } from '../viewport/viewport';
import { TransferForm } from './transfer-form';
import { transferLabel } from './transfer-label';

/** Transferências entre contas do mês, com filtro por conta; criar, editar e excluir (estornar). */
@Component({
  selector: 'gef-transfers-page',
  imports: [ConfirmDialog, EmptyView, ErrorView, FormsModule, Icon, LoadingView, MonthPicker, NgTemplateOutlet, Select, Sheet, TransferForm],
  template: `
    <section class="space-y-4">
      <header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 class="text-title-lg font-bold">Transferências</h1>
        <div class="flex flex-col gap-3 md:flex-row md:items-center">
          <gef-month-picker [(value)]="month" />
          <button type="button" class="gef-btn-primary flex items-center justify-center gap-2 md:w-auto" [disabled]="!canCreate()" (click)="startCreate()">
            <gef-icon name="plus" [size]="18" />Nova transferência
          </button>
        </div>
      </header>
      @if (referenceReady() && !canCreate()) {
        <p class="text-caption text-gefinc-muted" data-testid="create-hint">Para transferir, cadastre pelo menos duas contas bancárias ou de dinheiro ativas.</p>
      }

      <div class="max-w-sm">
        <gef-select ariaLabel="Filtrar por conta" [options]="accountOptions()" [ngModel]="accountId()" (ngModelChange)="accountId.set(+$event)" />
      </div>

      @if (message(); as text) {
        <p class="gef-alert-error" role="alert">{{ text }}</p>
      }

      @if (loading()) {
        <gef-loading variant="list" message="Carregando transferências…" />
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" [variant]="loadOffline() ? 'offline' : 'error'" (retry)="load()" />
      } @else if (items().length === 0) {
        <gef-empty icon="transfer" [title]="emptyTitle()" [hint]="emptyHint()">
          @if (canCreate()) {
            <button type="button" class="gef-btn-secondary" (click)="startCreate()">Nova transferência</button>
          }
        </gef-empty>
      } @else if (viewport.compact()) {
        <ul class="space-y-3">
          @for (transfer of items(); track transfer.id) {
            <li data-testid="transfer-card" class="gef-card p-4">
              <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div class="min-w-[9rem] flex-1 break-words">
                  <p class="font-semibold" data-testid="transfer-label">{{ label(transfer) }}</p>
                  <p class="text-caption text-gefinc-muted">{{ br(transfer.transferDate) }}</p>
                  @if (transfer.description) {
                    <p class="mt-1 text-caption text-gefinc-muted" data-testid="transfer-description">{{ transfer.description }}</p>
                  }
                </div>
                <div class="shrink-0 text-right">
                  <p class="financial-value font-bold" data-testid="transfer-amount">{{ money(transfer.amount) }}</p>
                  @if (transfer.scheduled) {
                    <span class="mt-1 inline-flex items-center gap-1 rounded-full border border-gefinc-warning/40 px-2 py-0.5 text-micro font-bold uppercase text-gefinc-warning" data-testid="scheduled-badge"><gef-icon name="clock" [size]="12" />Agendada</span>
                  }
                </div>
              </div>
              <div class="mt-2 flex flex-wrap gap-2 border-t border-gefinc-border pt-2">
                <button type="button" class="gef-btn-sm" [attr.aria-label]="'Editar ' + label(transfer)" (click)="startEdit(transfer)">Editar</button>
                <button type="button" class="gef-btn-sm gef-btn-sm-danger" [attr.aria-label]="'Excluir ' + label(transfer)" (click)="askDelete(transfer)">Excluir</button>
              </div>
            </li>
          }
        </ul>
        <ng-container *ngTemplateOutlet="paginationTpl" />
      } @else {
        <div class="overflow-x-auto rounded-xl border border-gefinc-border">
          <table class="w-full text-left text-body-base">
            <thead class="bg-gefinc-surface text-caption uppercase text-gefinc-muted">
              <tr>
                <th class="px-4 py-3">Data</th>
                <th class="px-4 py-3">Transferência</th>
                <th class="px-4 py-3">Descrição</th>
                <th class="px-4 py-3 text-right">Valor</th>
                <th class="px-4 py-3">Situação</th>
                <th class="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (transfer of items(); track transfer.id) {
                <tr class="border-t border-gefinc-border" data-testid="transfer-row">
                  <td class="whitespace-nowrap px-4 py-3">{{ br(transfer.transferDate) }}</td>
                  <td class="px-4 py-3 font-medium" data-testid="transfer-label">{{ label(transfer) }}</td>
                  <td class="px-4 py-3 text-gefinc-muted" data-testid="transfer-description">{{ transfer.description ?? '—' }}</td>
                  <td class="financial-value whitespace-nowrap px-4 py-3 text-right" data-testid="transfer-amount">{{ money(transfer.amount) }}</td>
                  <td class="px-4 py-3">
                    @if (transfer.scheduled) {
                      <span class="inline-flex items-center gap-1 rounded-full border border-gefinc-warning/40 px-2 py-0.5 text-micro font-bold uppercase text-gefinc-warning" data-testid="scheduled-badge"><gef-icon name="clock" [size]="12" />Agendada</span>
                    } @else {
                      <span class="text-gefinc-muted">Concluída</span>
                    }
                  </td>
                  <td class="px-4 py-3"><div class="flex flex-wrap justify-end gap-2">
                    <button type="button" class="gef-btn-sm" [attr.aria-label]="'Editar ' + label(transfer)" (click)="startEdit(transfer)">Editar</button>
                    <button type="button" class="gef-btn-sm gef-btn-sm-danger" [attr.aria-label]="'Excluir ' + label(transfer)" (click)="askDelete(transfer)">Excluir</button>
                  </div></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <ng-container *ngTemplateOutlet="paginationTpl" />
      }

      <ng-template #paginationTpl>
        <nav class="flex flex-wrap items-center justify-between gap-2 text-body-base text-gefinc-muted" aria-label="Paginação">
          <span class="whitespace-nowrap">{{ total() }} transferência(s)</span>
          <span class="flex gap-3">
            <button type="button" class="gef-btn-secondary" [disabled]="page() === 0" (click)="goTo(page() - 1)">Anterior</button>
            <button type="button" class="gef-btn-secondary" [disabled]="(page() + 1) * pageSize >= total()" (click)="goTo(page() + 1)">Próxima</button>
          </span>
        </nav>
      </ng-template>
    </section>
    <gef-sheet [heading]="editing() ? 'Editar transferência' : 'Nova transferência'" [open]="formOpen()" (closed)="closeForm()">
      @if (formOpen()) {
        <gef-transfer-form [transfer]="editing()" [accounts]="reference.accounts()" [resetToken]="formKey()" (saved)="onSaved()" (cancelled)="closeForm()" />
      }
    </gef-sheet>
    <gef-confirm-dialog
      [open]="!!deleting()"
      heading="Excluir transferência"
      [confirmLabel]="'Excluir transferência'"
      [busy]="deleteBusy()"
      [error]="deleteError()"
      (confirmed)="confirmDelete()"
      (cancelled)="closeDelete()"
    >
      @if (deleting(); as transfer) {
        <p>
          Excluir <strong>{{ label(transfer) }}</strong> de <span class="financial-value">{{ money(transfer.amount) }}</span>? O saldo das duas contas volta ao que era antes da transferência.
        </p>
      }
    </gef-confirm-dialog>
  `,
})
export class TransfersPage implements OnInit {
  private readonly api = inject(TransfersApi);
  private readonly notices = inject(NoticeService);
  private readonly freshness = inject(DATA_FRESHNESS);
  protected readonly reference = inject(ReferenceData);
  protected readonly viewport = inject(Viewport);

  protected readonly pageSize = TRANSFERS_PAGE_SIZE;
  protected readonly month = signal(currentMonth());
  /** Filtro por conta (origem ou destino); `0`: todas. */
  protected readonly accountId = signal(0);
  protected readonly page = signal(0);

  protected readonly items = signal<Transfer[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  /** O erro é falta de conexão (e não uma falha do servidor): a tela mostra o aviso de "Sem conexão". */
  protected readonly loadOffline = signal(false);
  /** De quando é a lista, se veio da cópia local do aparelho (`null`: do servidor). */
  private readonly staleAt = signal<Date | null>(null);
  protected readonly message = signal<string | null>(null);

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Transfer | null>(null);
  protected readonly formKey = signal(0);
  protected readonly deleting = signal<Transfer | null>(null);
  protected readonly deleteBusy = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  /** Chave de idempotência da exclusão em curso: reutilizada no reenvio, nova depois de uma resposta definitiva. */
  private deleteKey: string | null = null;

  protected readonly accountOptions = computed<SelectOption[]>(() => [
    { value: 0, label: 'Todas as contas' },
    ...this.reference.accounts().filter((a) => a.type !== 'CREDIT_CARD').map((a) => ({ value: a.id, label: a.name })),
  ]);
  /** Há ao menos duas contas elegíveis ativas: só então dá para transferir. */
  protected readonly canCreate = computed(() => transferableAccounts(this.reference.accounts()).length >= 2);
  protected readonly referenceReady = computed(() => this.reference.accountsLoaded());
  protected readonly emptyTitle = computed(() => {
    const since = this.staleAt();
    return since ? `Nenhuma transferência na última sincronização (${formatSyncedAt(since)})` : 'Nenhuma transferência neste mês';
  });
  protected readonly emptyHint = computed(() =>
    this.staleAt()
      ? 'Estes são os dados salvos neste aparelho; podem estar desatualizados. Conecte-se para atualizar.'
      : 'Mova saldo entre suas contas ou escolha outro mês.',
  );

  constructor() {
    // Qualquer mudança de mês ou de conta volta à primeira página e recarrega.
    effect(() => {
      this.month();
      this.accountId();
      untracked(() => {
        this.page.set(0);
        this.load();
      });
    });
    // Conflito de edição entre dispositivos ou dados renovados em segundo plano: recarrega a lista.
    effect(() => {
      if (this.notices.staleVersionCount() > 0 || this.notices.dataChangedCount() > 0) {
        untracked(() => this.load());
      }
    });
  }

  ngOnInit(): void {
    this.reference.refresh();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.list({ month: this.month(), accountId: this.accountId() || undefined, page: this.page(), size: TRANSFERS_PAGE_SIZE }).subscribe({
      next: (result) => {
        this.items.set(result.content);
        this.total.set(result.totalElements);
        this.staleAt.set(this.freshness());
        this.loading.set(false);
      },
      error: (e: unknown) => {
        const problem = toProblem(e);
        this.loadError.set(messageFor(problem));
        this.loadOffline.set(isOfflineProblem(problem));
        this.loading.set(false);
      },
    });
  }

  protected goTo(page: number): void {
    this.page.set(page);
    this.load();
  }

  protected label(transfer: Transfer): string {
    return transferLabel(transfer, this.accountId(), (id) => this.reference.accountName(id));
  }

  protected br(iso: string): string {
    return isoToBR(iso);
  }

  protected money(value: string): string {
    return formatBRL(value);
  }

  protected startCreate(): void {
    this.editing.set(null);
    this.formKey.update((k) => k + 1);
    this.formOpen.set(true);
  }

  protected startEdit(transfer: Transfer): void {
    this.editing.set(transfer);
    this.formKey.update((k) => k + 1);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected onSaved(): void {
    const created = !this.editing();
    this.closeForm();
    this.load();
    this.notices.toast(created ? 'Transferência registrada.' : 'Transferência atualizada.');
  }

  protected askDelete(transfer: Transfer): void {
    this.message.set(null);
    this.deleteError.set(null);
    this.deleteKey = null;
    this.deleting.set(transfer);
  }

  protected closeDelete(): void {
    if (!this.deleteBusy()) {
      this.deleting.set(null);
      this.deleteError.set(null);
    }
  }

  protected confirmDelete(): void {
    const transfer = this.deleting();
    if (!transfer || this.deleteBusy()) {
      return;
    }
    this.deleteKey ??= crypto.randomUUID();
    this.deleteBusy.set(true);
    this.deleteError.set(null);
    this.api.remove(transfer.id, this.deleteKey).subscribe({
      next: () => {
        this.deleteBusy.set(false);
        this.deleting.set(null);
        this.deleteKey = null;
        this.load();
        this.notices.toast('Transferência excluída.');
      },
      error: (e: unknown) => {
        this.deleteBusy.set(false);
        const problem = toProblem(e);
        if (problem.status >= 400 && problem.status < 500) {
          this.deleteKey = null;
        }
        if (problem.status === 404) {
          this.deleting.set(null);
          this.load();
          this.notices.toast('A transferência já havia sido excluída.');
        } else {
          this.deleteError.set(messageFor(problem));
        }
      },
    });
  }
}
