import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  CategoryType,
  GroupImpact,
  Transaction,
  TransactionStatus,
} from '@gefinc/core-models';
import {
  EmptyView,
  ErrorView,
  LoadingView,
  MoneyInput,
  MonthPicker,
  NoticeService,
  ReferenceData,
  TransactionsApi,
  messageFor,
  toProblem,
} from '@gefinc/ui-shared';
import { currentMonth, formatBRL, isoToBR, todayIso } from '@gefinc/utils';
import { GroupForm } from './group-form';

type Panel =
  | { kind: 'pay'; tx: Transaction }
  | { kind: 'edit'; tx: Transaction }
  | { kind: 'amount'; tx: Transaction }
  | { kind: 'delete'; tx: Transaction; impact: GroupImpact };

const PAGE_SIZE = 25;

/** Tabela analítica de lançamentos por mês de vencimento, com filtros e ações (FR-018 a FR-027). */
@Component({
  selector: 'gef-transactions-page',
  imports: [FormsModule, EmptyView, ErrorView, GroupForm, LoadingView, MoneyInput, MonthPicker],
  template: `
    <section class="space-y-4">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-title-lg font-bold">Lançamentos</h1>
        <div class="flex items-center gap-3">
          <gef-month-picker [(value)]="month" />
          <button type="button" class="gef-btn-secondary" (click)="formOpen.set(true)">Novo lançamento</button>
        </div>
      </header>

      @if (formOpen()) {
        <gef-group-form (saved)="onCreated()" (cancelled)="formOpen.set(false)" />
      }

      <div class="grid gap-3 sm:grid-cols-4">
        <select class="gef-input" aria-label="Natureza" [ngModel]="kind()" (ngModelChange)="kind.set($event)">
          <option value="">Receitas e despesas</option>
          <option value="EXPENSE">Despesas</option>
          <option value="INCOME">Receitas</option>
        </select>
        <select class="gef-input" aria-label="Status" [ngModel]="status()" (ngModelChange)="status.set($event)">
          <option value="">Todos os status</option>
          <option value="PENDING">Pendentes</option>
          <option value="PAID">Pagos</option>
        </select>
        <select class="gef-input" aria-label="Conta" [ngModel]="accountId()" (ngModelChange)="accountId.set(+$event)">
          <option value="0">Todas as contas</option>
          @for (account of reference.accounts(); track account.id) {
            <option [value]="account.id">{{ account.name }}</option>
          }
        </select>
        <select class="gef-input" aria-label="Categoria" [ngModel]="categoryId()" (ngModelChange)="categoryId.set(+$event)">
          <option value="0">Todas as categorias</option>
          @for (category of reference.categories(); track category.id) {
            <option [value]="category.id">{{ category.name }}</option>
          }
        </select>
      </div>

      @if (message(); as text) {
        <p class="gef-alert-error" role="alert">{{ text }}</p>
      }

      @if (panel(); as p) {
        <div class="space-y-3 rounded-xl border border-gefinc-border bg-gefinc-surface p-4" role="dialog" aria-label="Ação no lançamento">
          @switch (p.kind) {
            @case ('pay') {
              <p>Registrar o pagamento de <strong>{{ p.tx.description }}</strong>?</p>
              <label class="gef-label" for="paymentDate">Data do pagamento</label>
              <input id="paymentDate" class="gef-input max-w-48" type="date" [(ngModel)]="paymentDate" />
              <div class="flex gap-3">
                <button type="button" class="gef-btn-primary max-w-40" (click)="confirmPay(p.tx)">Confirmar</button>
                <button type="button" class="gef-btn-secondary" (click)="panel.set(null)">Cancelar</button>
              </div>
            }
            @case ('edit') {
              <p>Editar <strong>{{ p.tx.description }}</strong></p>
              <div class="grid gap-3 sm:grid-cols-2">
                <gef-money-input label="Valor" [ngModel]="editAmount()" (ngModelChange)="editAmount.set($event)" />
                @if (!isCard(p.tx)) {
                  <div>
                    <label class="gef-label" for="editDue">Vencimento</label>
                    <input id="editDue" class="gef-input" type="date" [(ngModel)]="editDueDate" />
                  </div>
                }
              </div>
              <div class="flex gap-3">
                <button type="button" class="gef-btn-primary max-w-40" (click)="confirmEdit(p.tx)">Salvar</button>
                <button type="button" class="gef-btn-secondary" (click)="panel.set(null)">Cancelar</button>
              </div>
            }
            @case ('amount') {
              <p>
                Novo valor mensal de <strong>{{ p.tx.description }}</strong> a partir de
                {{ p.tx.dueDate.slice(0, 7) }} (meses anteriores e já pagos não mudam):
              </p>
              <gef-money-input label="Novo valor" [ngModel]="editAmount()" (ngModelChange)="editAmount.set($event)" />
              <div class="flex gap-3">
                <button type="button" class="gef-btn-primary max-w-40" (click)="confirmAmount(p.tx)">Aplicar</button>
                <button type="button" class="gef-btn-secondary" (click)="panel.set(null)">Cancelar</button>
              </div>
            }
            @case ('delete') {
              <p>
                Excluir <strong>{{ p.tx.description }}</strong>? Serão removidos {{ p.impact.pendingCount }} lançamento(s)
                pendente(s); {{ p.impact.paidCount }} já pago(s) serão preservados.
              </p>
              <div class="flex gap-3">
                <button type="button" class="gef-btn-danger max-w-40" (click)="confirmDelete(p.tx)">Excluir</button>
                <button type="button" class="gef-btn-secondary" (click)="panel.set(null)">Cancelar</button>
              </div>
            }
          }
        </div>
      }

      @if (loading()) {
        <gef-loading message="Carregando lançamentos…" />
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" (retry)="load()" />
      } @else if (items().length === 0) {
        <gef-empty title="Nenhum lançamento neste mês" hint="Cadastre um lançamento ou escolha outro mês.">
          <button type="button" class="gef-btn-secondary" (click)="formOpen.set(true)">Novo lançamento</button>
        </gef-empty>
      } @else {
        <div class="overflow-x-auto rounded-xl border border-gefinc-border">
          <table class="w-full text-left text-body-base">
            <thead class="bg-gefinc-surface text-caption uppercase text-gefinc-muted">
              <tr>
                <th class="px-4 py-3">Vencimento</th>
                <th class="px-4 py-3">Descrição</th>
                <th class="px-4 py-3">Categoria</th>
                <th class="px-4 py-3">Conta</th>
                <th class="px-4 py-3">Parcela</th>
                <th class="px-4 py-3 text-right">Valor</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (tx of items(); track tx.id) {
                <tr class="border-t border-gefinc-border">
                  <td class="px-4 py-3">{{ br(tx.dueDate) }}</td>
                  <td class="px-4 py-3 font-medium">{{ tx.description }}</td>
                  <td class="px-4 py-3">
                    <span class="flex items-center gap-2">
                      <span class="h-3 w-3 rounded-full" [style.background]="reference.category(tx.categoryId)?.colorHex" aria-hidden="true"></span>
                      {{ reference.category(tx.categoryId)?.name }}
                    </span>
                  </td>
                  <td class="px-4 py-3">{{ reference.accountName(tx.accountId) }}</td>
                  <td class="px-4 py-3 text-gefinc-muted">{{ installmentLabel(tx) }}</td>
                  <td class="financial-value px-4 py-3 text-right" [class.text-gefinc-primary]="isIncome(tx)">{{ money(tx.amount) }}</td>
                  <td class="px-4 py-3">
                    <span class="rounded-full border px-2 py-0.5 text-micro font-bold uppercase" [class]="badge(tx).css">{{ badge(tx).label }}</span>
                  </td>
                  <td class="space-x-2 px-4 py-3 text-right">
                    @if (tx.status === 'PENDING') {
                      <button type="button" class="gef-link" (click)="openPay(tx)">Pagar</button>
                      <button type="button" class="gef-link" (click)="openEdit(tx)">Editar</button>
                    } @else {
                      <button type="button" class="gef-link" (click)="unpay(tx)">Desfazer</button>
                    }
                    @if (tx.recurrenceType === 'FIXED' && tx.status === 'PENDING') {
                      <button type="button" class="gef-link" (click)="openAmount(tx)">Alterar valor daqui</button>
                      <button type="button" class="gef-link" (click)="endHere(tx)">Encerrar aqui</button>
                    }
                    <button type="button" class="text-gefinc-danger hover:underline" (click)="openDelete(tx)">Excluir</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <nav class="flex items-center justify-between text-body-base text-gefinc-muted" aria-label="Paginação">
          <span>{{ total() }} lançamento(s)</span>
          <span class="space-x-3">
            <button type="button" class="gef-btn-secondary" [disabled]="page() === 0" (click)="goTo(page() - 1)">Anterior</button>
            <button type="button" class="gef-btn-secondary" [disabled]="(page() + 1) * pageSize >= total()" (click)="goTo(page() + 1)">Próxima</button>
          </span>
        </nav>
      }
    </section>
  `,
})
export class TransactionsPage implements OnInit {
  private readonly api = inject(TransactionsApi);
  private readonly notices = inject(NoticeService);
  protected readonly reference = inject(ReferenceData);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly month = signal(currentMonth());
  protected readonly kind = signal<CategoryType | ''>('');
  protected readonly status = signal<TransactionStatus | ''>('');
  protected readonly accountId = signal(0);
  protected readonly categoryId = signal(0);
  protected readonly page = signal(0);

  protected readonly items = signal<Transaction[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly panel = signal<Panel | null>(null);

  protected paymentDate = todayIso();
  protected editDueDate = '';
  protected readonly editAmount = signal<string | null>(null);

  private readonly incomeIds = computed(
    () => new Set(this.reference.categories().filter((c) => c.type === 'INCOME').map((c) => c.id)),
  );

  constructor() {
    // Qualquer mudança de mês ou filtro volta à primeira página e recarrega.
    effect(() => {
      this.month();
      this.kind();
      this.status();
      this.accountId();
      this.categoryId();
      untracked(() => {
        this.page.set(0);
        this.load();
      });
    });
    // Conflito de edição entre dispositivos: recarrega com a versão mais recente.
    effect(() => {
      if (this.notices.staleVersionCount() > 0) {
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
    this.api
      .list({
        month: this.month(),
        kind: this.kind() || undefined,
        status: this.status() || undefined,
        accountId: this.accountId() || undefined,
        categoryId: this.categoryId() || undefined,
        page: this.page(),
        size: PAGE_SIZE,
      })
      .subscribe({
        next: (result) => {
          this.items.set(result.content);
          this.total.set(result.totalElements);
          this.loading.set(false);
        },
        error: (e: unknown) => {
          this.loadError.set(messageFor(toProblem(e)));
          this.loading.set(false);
        },
      });
  }

  protected goTo(page: number): void {
    this.page.set(page);
    this.load();
  }

  protected onCreated(): void {
    this.formOpen.set(false);
    this.load();
  }

  protected br(iso: string): string {
    return isoToBR(iso);
  }

  protected money(value: string): string {
    return formatBRL(value);
  }

  protected isCard(tx: Transaction): boolean {
    return this.reference.accounts().find((a) => a.id === tx.accountId)?.type === 'CREDIT_CARD';
  }

  protected isIncome(tx: Transaction): boolean {
    return this.incomeIds().has(tx.categoryId);
  }

  protected installmentLabel(tx: Transaction): string {
    if (tx.recurrenceType === 'INSTALLMENT') {
      return `${tx.installmentNumber}/${tx.totalInstallments}`;
    }
    return tx.recurrenceType === 'FIXED' ? 'Fixo' : '—';
  }

  /** Selo de status conforme o manual de identidade visual (pendente, pago, vencido). */
  protected badge(tx: Transaction): { label: string; css: string } {
    if (tx.status === 'PAID') {
      return { label: 'Pago', css: 'border-gefinc-primary/25 bg-gefinc-primary/10 text-gefinc-primary' };
    }
    if (tx.overdue) {
      return { label: 'Vencido', css: 'border-gefinc-danger/25 bg-gefinc-danger/10 text-gefinc-danger' };
    }
    return { label: 'Pend', css: 'border-gefinc-warning/25 bg-gefinc-warning/10 text-gefinc-warning' };
  }

  protected openPay(tx: Transaction): void {
    this.paymentDate = todayIso();
    this.panel.set({ kind: 'pay', tx });
  }

  protected openEdit(tx: Transaction): void {
    this.editAmount.set(tx.amount);
    this.editDueDate = tx.dueDate;
    this.panel.set({ kind: 'edit', tx });
  }

  protected openAmount(tx: Transaction): void {
    this.editAmount.set(tx.amount);
    this.panel.set({ kind: 'amount', tx });
  }

  protected openDelete(tx: Transaction): void {
    this.api.groupImpact(tx.groupId).subscribe({
      next: (impact) => this.panel.set({ kind: 'delete', tx, impact }),
      error: (e: unknown) => this.message.set(messageFor(toProblem(e))),
    });
  }

  protected confirmPay(tx: Transaction): void {
    this.run(this.api.pay(tx.id, this.paymentDate));
  }

  protected unpay(tx: Transaction): void {
    this.run(this.api.unpay(tx.id));
  }

  protected confirmEdit(tx: Transaction): void {
    const amount = this.editAmount();
    if (!amount) {
      return;
    }
    this.run(
      this.api.patch(tx.id, {
        amount,
        ...(this.isCard(tx) ? {} : { dueDate: this.editDueDate }),
        version: tx.version,
      }),
    );
  }

  protected confirmAmount(tx: Transaction): void {
    const amount = this.editAmount();
    if (amount) {
      this.run(this.api.changeAmount(tx.groupId, tx.dueDate.slice(0, 7), amount));
    }
  }

  protected endHere(tx: Transaction): void {
    this.run(this.api.endGroup(tx.groupId, tx.dueDate.slice(0, 7)));
  }

  protected confirmDelete(tx: Transaction): void {
    this.run(this.api.deleteGroup(tx.groupId));
  }

  private run(request: { subscribe: (observer: { next: () => void; error: (e: unknown) => void }) => unknown }): void {
    this.message.set(null);
    request.subscribe({
      next: () => {
        this.panel.set(null);
        this.load();
      },
      error: (e: unknown) => this.message.set(messageFor(toProblem(e))),
    });
  }
}
