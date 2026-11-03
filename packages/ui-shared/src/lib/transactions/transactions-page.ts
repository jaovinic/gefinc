import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import type { Observable } from 'rxjs';
import type {
  CategoryType,
  GroupImpact,
  Transaction,
  TransactionStatus,
} from '@gefinc/core-models';
import { NoticeService, ReferenceData, TransactionsApi, messageFor, toProblem } from '../api';
import { AccountBadge, type AccountLike } from '../accounts/account-badge';
import { Icon } from '../icons/icon';
import { DateField } from '../date-field/date-field';
import { ConfirmDialog } from '../layout/confirm-dialog';
import { Sheet } from '../layout/sheet';
import { MoneyInput } from '../money-input/money-input';
import { MonthPicker } from '../month-picker/month-picker';
import { Select, type SelectOption } from '../select/select';
import { EmptyView, ErrorView, LoadingView } from '../state-views/state-views';
import { Viewport } from '../viewport/viewport';
import { currentMonth, formatBRL, isoToBR, todayIso } from '@gefinc/utils';
import { GroupForm } from './group-form';
import { incomeDateHint } from './income-hint';
import { PENDING_MARKER } from './pending-marker';

type Panel =
  | { kind: 'pay'; tx: Transaction }
  | { kind: 'edit'; tx: Transaction }
  | { kind: 'amount'; tx: Transaction };

/** Ações destrutivas que pedem confirmação num diálogo modal (nos dois formatos de tela). */
type Confirming = { kind: 'delete'; tx: Transaction; impact: GroupImpact } | { kind: 'end'; tx: Transaction };

const PAGE_SIZE = 25;

/** Tabela analítica de lançamentos por mês de vencimento, com filtros e ações (FR-018 a FR-027). */
@Component({
  selector: 'gef-transactions-page',
  imports: [AccountBadge, ConfirmDialog, DateField, FormsModule, Icon, NgTemplateOutlet, EmptyView, ErrorView, GroupForm, LoadingView, MoneyInput, MonthPicker, Select, Sheet],
  template: `
    <section class="space-y-4">
      <header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 class="text-title-lg font-bold">Lançamentos</h1>
        <div class="flex flex-col gap-3 md:flex-row md:items-center">
          <gef-month-picker [(value)]="month" />
          <div class="flex flex-wrap gap-3">
            <button type="button" class="gef-btn-primary flex w-auto flex-1 basis-auto items-center justify-center gap-2 md:w-auto" (click)="formOpen.set(true)">
              <gef-icon name="plus" [size]="18" />Novo lançamento
            </button>
            @if (viewport.compact()) {
              <button type="button" class="gef-btn-secondary flex shrink-0 items-center gap-2 whitespace-nowrap" (click)="filtersOpen.set(true)">
                <gef-icon name="filter" [size]="18" />Filtros@if (activeFilters() > 0) {
                  ({{ activeFilters() }})
                }
              </button>
            }
          </div>
        </div>
      </header>

      @if (viewport.compact()) {
        <gef-sheet heading="Novo lançamento" [open]="formOpen()" (closed)="formOpen.set(false)">
          @if (formOpen()) {
            <gef-group-form (saved)="onCreated()" (cancelled)="formOpen.set(false)" />
          }
        </gef-sheet>
        <gef-sheet heading="Filtros" [open]="filtersOpen()" (closed)="filtersOpen.set(false)">
          @if (filtersOpen()) {
            <ng-container *ngTemplateOutlet="filtersTpl" />
            <button type="button" class="gef-btn-primary mt-4" (click)="filtersOpen.set(false)">Aplicar</button>
          }
        </gef-sheet>
      } @else {
        @if (formOpen()) {
          <gef-group-form (saved)="onCreated()" (cancelled)="formOpen.set(false)" />
        }
        <ng-container *ngTemplateOutlet="filtersTpl" />
      }

      <ng-template #filtersTpl>
        <div class="grid gap-3 sm:grid-cols-4">
          <gef-select ariaLabel="Natureza" [options]="kindOptions" [ngModel]="kind()" (ngModelChange)="kind.set($event)" />
          <gef-select ariaLabel="Status" [options]="statusOptions()" [ngModel]="status()" (ngModelChange)="status.set($event)" />
          <gef-select ariaLabel="Conta" [options]="accountOptions()" [ngModel]="accountId()" (ngModelChange)="accountId.set(+$event)" />
          <gef-select ariaLabel="Categoria" [options]="categoryOptions()" [ngModel]="categoryId()" (ngModelChange)="categoryId.set(+$event)" />
        </div>
      </ng-template>

      @if (message(); as text) {
        <p class="gef-alert-error" role="alert">{{ text }}</p>
      }

      <ng-template #panelErrorTpl>
        @if (panelError(); as text) {
          <p id="panel-error" class="gef-field-error" role="alert">{{ text }}</p>
        }
      </ng-template>

      <ng-template #panelTpl let-p>
        @switch (p.kind) {
          @case ('pay') {
            @if (isIncome(p.tx) && isFuture(p.tx)) {
              <p>Antecipar o recebimento de <strong>{{ p.tx.description }}</strong>? O valor entra na conta agora e a receita deixa de ficar a receber até {{ br(p.tx.dueDate) }}.</p>
            } @else {
              <p>Registrar o {{ isIncome(p.tx) ? 'recebimento' : 'pagamento' }} de <strong>{{ p.tx.description }}</strong>?</p>
            }
            <div>
              <gef-date-field
                class="max-w-56"
                inputId="paymentDate"
                [label]="'Data do ' + (isIncome(p.tx) ? 'recebimento' : 'pagamento')"
                [describedBy]="panelError() ? 'panel-error' : null"
                [ngModel]="paymentDate"
                (ngModelChange)="paymentDate = $event; panelError.set(null)"
              />
              <ng-container *ngTemplateOutlet="panelErrorTpl" />
            </div>
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
                  <gef-date-field
                    inputId="editDue"
                    [label]="isIncome(p.tx) ? 'Data do recebimento' : 'Vencimento'"
                    [describedBy]="panelError() ? 'panel-error' : null"
                    [ngModel]="editDueDate"
                    (ngModelChange)="editDueDate = $event; panelError.set(null)"
                  />
                  @if (isIncome(p.tx) && editDueDate) {
                    <p class="mt-1 text-caption text-gefinc-muted" aria-live="polite">{{ incomeHint(editDueDate) }}</p>
                  }
                </div>
              }
            </div>
            <ng-container *ngTemplateOutlet="panelErrorTpl" />
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
            <ng-container *ngTemplateOutlet="panelErrorTpl" />
            <div class="flex gap-3">
              <button type="button" class="gef-btn-primary max-w-40" (click)="confirmAmount(p.tx)">Aplicar</button>
              <button type="button" class="gef-btn-secondary" (click)="panel.set(null)">Cancelar</button>
            </div>
          }
        }
      </ng-template>
      @if (panel(); as p) {
        @if (viewport.compact()) {
          <gef-sheet heading="Ação no lançamento" [open]="true" (closed)="panel.set(null)">
            <div class="space-y-3"><ng-container *ngTemplateOutlet="panelTpl; context: { $implicit: p }" /></div>
          </gef-sheet>
        } @else {
          <div class="space-y-3 gef-card p-4" role="dialog" aria-label="Ação no lançamento">
            <ng-container *ngTemplateOutlet="panelTpl; context: { $implicit: p }" />
          </div>
        }
      }
      <gef-confirm-dialog
        [open]="!!confirming()"
        [heading]="confirming()?.kind === 'end' ? 'Encerrar lançamento' : 'Excluir lançamento'"
        [confirmLabel]="confirmLabel()"
        [busyLabel]="confirming()?.kind === 'end' ? 'Encerrando…' : 'Excluindo…'"
        [busy]="acting()"
        [error]="confirmError()"
        (confirmed)="confirmAction()"
        (cancelled)="closeConfirm()"
      >
        @if (confirming(); as c) {
          @if (c.kind === 'end') {
            <p>
              Encerrar <strong>{{ c.tx.description }}</strong> em {{ endMonthLabel(c.tx) }}? As ocorrências pendentes depois deste mês serão removidas; as já pagas e as anteriores
              permanecem.
            </p>
          } @else if (settlesByDate(c.tx) && c.tx.recurrenceType === 'VARIABLE') {
            <p>
              Excluir <strong>{{ c.tx.description }}</strong>?
              @if (c.tx.status === 'PAID') {
                O valor de <span class="financial-value">{{ money(c.tx.amount) }}</span> sai do saldo da conta.
              } @else {
                A receita ainda não entrou no saldo e será removida.
              }
            </p>
          } @else {
            <p>
              Excluir <strong>{{ c.tx.description }}</strong>? Serão removidos {{ c.impact.pendingCount }} lançamento(s) pendente(s); {{ c.impact.paidCount }} já
              {{ isIncome(c.tx) ? 'recebido(s)' : 'pago(s)' }} serão preservados.
            </p>
          }
        }
      </gef-confirm-dialog>

      @if (loading()) {
        <gef-loading variant="list" message="Carregando lançamentos…" />
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" (retry)="load()" />
      } @else if (items().length === 0) {
        <gef-empty icon="list" title="Nenhum lançamento neste mês" hint="Cadastre um lançamento ou escolha outro mês.">
          <button type="button" class="gef-btn-secondary" (click)="formOpen.set(true)">Novo lançamento</button>
        </gef-empty>
      } @else if (viewport.compact()) {
        <ul class="space-y-3">
          @for (tx of items(); track tx.id) {
            <li data-testid="transaction-card" class="gef-card p-4">
              <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div class="min-w-[9rem] flex-1 break-words">
                  <p class="font-semibold">{{ tx.description }}</p>
                  <p class="text-caption text-gefinc-muted">
                    {{ br(tx.dueDate) }}
                    @if (installmentLabel(tx) !== '—') {
                      · {{ installmentLabel(tx) }}
                    }
                  </p>
                  <p class="mt-1 flex items-center gap-2 text-caption text-gefinc-muted">
                    <span class="h-3 w-3 shrink-0 rounded-full" [style.background]="reference.category(tx.categoryId)?.colorHex" aria-hidden="true"></span>
                    {{ reference.category(tx.categoryId)?.name }}
                  </p>
                  <gef-account-badge class="mt-2" [account]="accountOf(tx)" [showHolder]="false" />
                </div>
                <div class="shrink-0 text-right">
                  <p class="financial-value flex items-center justify-end gap-1 font-bold" [class.text-gefinc-primary]="isIncome(tx)" [class.text-gefinc-danger]="!isIncome(tx)" [attr.data-kind]="isIncome(tx) ? 'income' : 'expense'">
                    <gef-icon [name]="isIncome(tx) ? 'arrow-up' : 'arrow-down'" [size]="14" />{{ signed(tx) }}
                  </p>
                  <span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-micro font-bold uppercase" [class]="badge(tx).css"><gef-icon [name]="badge(tx).icon" [size]="12" />{{ badge(tx).label }}</span>
                </div>
              </div>
              @if (isLocal(tx)) {
                <p class="mt-2 border-t border-gefinc-border pt-2 text-caption text-gefinc-warning">Pendente de envio</p>
              } @else {
                <div class="mt-2 flex flex-wrap gap-2 border-t border-gefinc-border pt-2">
                  <ng-container *ngTemplateOutlet="actionsTpl; context: { $implicit: tx }" />
                </div>
              }
            </li>
          }
        </ul>
        <ng-container *ngTemplateOutlet="paginationTpl" />
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
                  <td class="max-w-56 px-4 py-3"><gef-account-badge [account]="accountOf(tx)" [showHolder]="false" /></td>
                  <td class="px-4 py-3 text-gefinc-muted">{{ installmentLabel(tx) }}</td>
                  <td class="financial-value whitespace-nowrap px-4 py-3 text-right" [class.text-gefinc-primary]="isIncome(tx)" [class.text-gefinc-danger]="!isIncome(tx)" [attr.data-kind]="isIncome(tx) ? 'income' : 'expense'">
                    <span class="inline-flex items-center justify-end gap-1"><gef-icon [name]="isIncome(tx) ? 'arrow-up' : 'arrow-down'" [size]="14" />{{ signed(tx) }}</span>
                  </td>
                  <td class="px-4 py-3">
                    <span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-micro font-bold uppercase" [class]="badge(tx).css"><gef-icon [name]="badge(tx).icon" [size]="12" />{{ badge(tx).label }}</span>
                  </td>
                  <td class="px-4 py-3"><div class="flex flex-wrap justify-end gap-2">
                    @if (isLocal(tx)) {
                      <span class="text-caption text-gefinc-warning">Pendente de envio</span>
                    } @else {
                      <ng-container *ngTemplateOutlet="actionsTpl; context: { $implicit: tx }" />
                    }
                  </div></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <ng-container *ngTemplateOutlet="paginationTpl" />
      }
      <ng-template #actionsTpl let-tx>
        @if (tx.status === 'PENDING') {
          <button type="button" class="gef-btn-sm gef-btn-sm-primary" [attr.aria-label]="payLabel(tx) + ' ' + tx.description" (click)="openPay(tx)">{{ payLabel(tx) }}</button>
        }
        @if (canEdit(tx)) {
          <button type="button" class="gef-btn-sm" [attr.aria-label]="'Editar ' + tx.description" (click)="openEdit(tx)">Editar</button>
        }
        @if (canUndo(tx)) {
          <button type="button" class="gef-btn-sm" [attr.aria-label]="'Desfazer ' + tx.description" (click)="unpay(tx)">Desfazer</button>
        }
        @if (tx.recurrenceType === 'FIXED' && tx.status === 'PENDING') {
          <button type="button" class="gef-btn-sm" [attr.aria-label]="'Alterar valor ' + tx.description" (click)="openAmount(tx)">Alterar valor daqui</button>
          <button type="button" class="gef-btn-sm" [attr.aria-label]="'Encerrar ' + tx.description" (click)="askEnd(tx)">Encerrar aqui</button>
        }
        <button type="button" class="gef-btn-sm gef-btn-sm-danger" [attr.aria-label]="'Excluir ' + tx.description" (click)="openDelete(tx)">Excluir</button>
      </ng-template>
      <ng-template #paginationTpl>
        <nav class="flex flex-wrap items-center justify-between gap-2 text-body-base text-gefinc-muted" aria-label="Paginação">
          <span class="whitespace-nowrap">{{ total() }} lançamento(s)</span>
          <span class="flex gap-3">
            <button type="button" class="gef-btn-secondary" [disabled]="page() === 0" (click)="goTo(page() - 1)">Anterior</button>
            <button type="button" class="gef-btn-secondary" [disabled]="(page() + 1) * pageSize >= total()" (click)="goTo(page() + 1)">Próxima</button>
          </span>
        </nav>
      </ng-template>
    </section>
  `,
})
export class TransactionsPage implements OnInit {
  private readonly api = inject(TransactionsApi);
  private readonly notices = inject(NoticeService);
  protected readonly reference = inject(ReferenceData);
  protected readonly viewport = inject(Viewport);
  protected readonly isLocal = inject(PENDING_MARKER);
  private readonly route = inject(ActivatedRoute, { optional: true });

  protected readonly pageSize = PAGE_SIZE;
  /** Filtros iniciais vindos da rota (ex.: toque em um lembrete): `month`, `status` e `kind`. */
  private readonly initial = this.route?.snapshot.queryParamMap;
  protected readonly month = signal(/^\d{4}-(0[1-9]|1[0-2])$/.test(this.initial?.get('month') ?? '') ? this.initial!.get('month')! : currentMonth());
  protected readonly kind = signal<CategoryType | ''>(['EXPENSE', 'INCOME'].includes(this.initial?.get('kind') ?? '') ? (this.initial!.get('kind') as CategoryType) : '');
  protected readonly status = signal<TransactionStatus | ''>(['PENDING', 'PAID'].includes(this.initial?.get('status') ?? '') ? (this.initial!.get('status') as TransactionStatus) : '');
  protected readonly accountId = signal(0);
  protected readonly categoryId = signal(0);
  protected readonly page = signal(0);

  protected readonly items = signal<Transaction[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly filtersOpen = signal(false);
  protected readonly kindOptions: SelectOption[] = [
    { value: '', label: 'Receitas e despesas' },
    { value: 'EXPENSE', label: 'Despesas' },
    { value: 'INCOME', label: 'Receitas' },
  ];
  protected readonly statusOptions = computed<SelectOption[]>(() => {
    const income = this.kind() === 'INCOME';
    return [
      { value: '', label: 'Todos os status' },
      { value: 'PENDING', label: income ? 'A receber' : 'Pendentes' },
      { value: 'PAID', label: income ? 'Recebidas' : 'Pagos' },
    ];
  });
  protected readonly accountOptions = computed<SelectOption[]>(() => [
    { value: 0, label: 'Todas as contas' },
    ...this.reference.accounts().map((a) => ({ value: a.id, label: a.name })),
  ]);
  protected readonly categoryOptions = computed<SelectOption[]>(() => [
    { value: 0, label: 'Todas as categorias' },
    ...this.reference.categories().map((c) => ({ value: c.id, label: c.name })),
  ]);
  protected readonly activeFilters = computed(
    () => [this.kind() !== '', this.status() !== '', this.accountId() !== 0, this.categoryId() !== 0].filter(Boolean).length,
  );
  protected readonly panel = signal<Panel | null>(null);
  /** Ação do painel em andamento: toques repetidos não registram a operação de novo. */
  protected readonly acting = signal(false);
  protected readonly confirming = signal<Confirming | null>(null);
  protected readonly confirmError = signal<string | null>(null);

  /** Aviso das ações do painel (pagar, editar, novo valor): aparece dentro do painel, pois o aviso da página fica atrás do fundo do painel. */
  protected readonly panelError = signal<string | null>(null);
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
    this.notices.toast('Lançamento registrado.');
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

  /** Conta do lançamento para o selo; sem a conta carregada ainda mostra um traço. */
  protected accountOf(tx: Transaction): AccountLike {
    return this.reference.account(tx.accountId) ?? { name: '—', type: 'CHECKING' };
  }

  protected isIncome(tx: Transaction): boolean {
    return this.incomeIds().has(tx.categoryId);
  }

  protected incomeHint(date: string): string {
    return incomeDateHint(date, todayIso());
  }

  protected isFuture(tx: Transaction): boolean {
    return tx.dueDate > todayIso();
  }

  /** Receber só vale para receita ainda pendente (futura); "Antecipar" enquanto a data não chegou. */
  protected payLabel(tx: Transaction): string {
    if (!this.isIncome(tx)) {
      return 'Pagar';
    }
    if (this.isCard(tx)) {
      return 'Receber';
    }
    return this.isFuture(tx) ? 'Antecipar recebimento' : 'Receber';
  }

  /** Receita liquidada pela data: só a receita fora de cartão. Em cartão (legado) vale a regra de despesa. */
  protected settlesByDate(tx: Transaction): boolean {
    return this.isIncome(tx) && !this.isCard(tx);
  }

  /** Despesa (e receita legada em cartão) só se edita pendente; receita fora de cartão se edita também depois de recebida. */
  protected canEdit(tx: Transaction): boolean {
    return this.settlesByDate(tx) || tx.status === 'PENDING';
  }

  /** Receita já na conta (data de hoje ou anterior) não volta a pendente: só a antecipada (data futura) desfaz. */
  protected canUndo(tx: Transaction): boolean {
    return tx.status === 'PAID' && (!this.settlesByDate(tx) || this.isFuture(tx));
  }

  protected installmentLabel(tx: Transaction): string {
    if (tx.recurrenceType === 'INSTALLMENT') {
      return `${tx.installmentNumber}/${tx.totalInstallments}`;
    }
    return tx.recurrenceType === 'FIXED' ? 'Fixo' : '—';
  }

  /** Selo de status conforme o manual de identidade visual (pendente, pago, vencido). */
  protected badge(tx: Transaction): { label: string; css: string; icon: string } {
    const income = this.isIncome(tx);
    if (tx.status === 'PAID') {
      return { label: income ? 'Recebido' : 'Pago', icon: 'check', css: 'border-gefinc-primary/25 bg-gefinc-primary/10 text-gefinc-primary' };
    }
    if (tx.overdue && !income) {
      return { label: 'Vencido', icon: 'alert', css: 'border-gefinc-danger/25 bg-gefinc-danger/10 text-gefinc-danger' };
    }
    return { label: income ? 'A receber' : 'Pendente', icon: 'clock', css: 'border-gefinc-warning/25 bg-gefinc-warning/10 text-gefinc-warning' };
  }

  /** Valor com sinal: receita com "+" e despesa com "−", para não depender só da cor. */
  protected signed(tx: Transaction): string {
    return `${this.isIncome(tx) ? '+' : '\u2212'} ${this.money(tx.amount)}`;
  }

  protected openPay(tx: Transaction): void {
    this.paymentDate = todayIso();
    this.panelError.set(null);
    this.panel.set({ kind: 'pay', tx });
  }

  protected openEdit(tx: Transaction): void {
    this.editAmount.set(tx.amount);
    this.editDueDate = tx.dueDate;
    this.panelError.set(null);
    this.panel.set({ kind: 'edit', tx });
  }

  protected openAmount(tx: Transaction): void {
    this.editAmount.set(tx.amount);
    this.panelError.set(null);
    this.panel.set({ kind: 'amount', tx });
  }

  protected openDelete(tx: Transaction): void {
    this.api.groupImpact(tx.groupId).subscribe({
      next: (impact) => {
        this.confirmError.set(null);
        this.confirming.set({ kind: 'delete', tx, impact });
      },
      error: (e: unknown) => this.message.set(messageFor(toProblem(e))),
    });
  }

  protected confirmPay(tx: Transaction): void {
    const income = this.isIncome(tx);
    if (!this.paymentDate) {
      this.panelError.set('Informe uma data válida (dd/mm/aaaa).');
      return;
    }
    this.run(this.api.pay(tx.id, this.paymentDate), income ? 'Recebimento registrado.' : 'Pagamento registrado.', () => this.unpay(tx, false));
  }

  protected unpay(tx: Transaction, announce = true): void {
    this.run(this.api.unpay(tx.id), announce ? (this.isIncome(tx) ? 'Recebimento desfeito.' : 'Pagamento desfeito.') : undefined);
  }

  protected confirmEdit(tx: Transaction): void {
    const amount = this.editAmount();
    if (!amount) {
      return;
    }
    if (!this.isCard(tx) && !this.editDueDate) {
      this.panelError.set('Informe uma data válida (dd/mm/aaaa).');
      return;
    }
    this.run(
      this.api.patch(tx.id, {
        amount,
        ...(this.isCard(tx) ? {} : { dueDate: this.editDueDate }),
        version: tx.version,
      }),
      'Lançamento atualizado.',
    );
  }

  protected confirmAmount(tx: Transaction): void {
    const amount = this.editAmount();
    if (amount) {
      this.run(this.api.changeAmount(tx.groupId, tx.dueDate.slice(0, 7), amount), 'Valor atualizado.');
    }
  }

  protected askEnd(tx: Transaction): void {
    this.confirmError.set(null);
    this.confirming.set({ kind: 'end', tx });
  }

  protected endMonthLabel(tx: Transaction): string {
    const [year, month] = tx.dueDate.slice(0, 7).split('-');
    return `${month}/${year}`;
  }

  protected confirmLabel(): string {
    const c = this.confirming();
    if (!c) {
      return 'Excluir';
    }
    return c.kind === 'end' ? 'Encerrar lançamento' : `Excluir "${c.tx.description}"`;
  }

  protected closeConfirm(): void {
    if (!this.acting()) {
      this.confirming.set(null);
      this.confirmError.set(null);
    }
  }

  protected confirmAction(): void {
    const c = this.confirming();
    if (!c || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.confirmError.set(null);
    const request: Observable<unknown> = c.kind === 'end' ? this.api.endGroup(c.tx.groupId, c.tx.dueDate.slice(0, 7)) : this.api.deleteGroup(c.tx.groupId);
    request.subscribe({
      next: () => {
        this.acting.set(false);
        this.confirming.set(null);
        this.load();
        this.notices.toast(c.kind === 'end' ? 'Lançamento encerrado.' : 'Lançamento excluído.');
      },
      error: (e: unknown) => {
        this.acting.set(false);
        this.confirmError.set(messageFor(toProblem(e)));
      },
    });
  }

  private run(
    request: { subscribe: (observer: { next: () => void; error: (e: unknown) => void }) => unknown },
    success?: string,
    undo?: () => void,
  ): void {
    if (this.acting()) {
      return;
    }
    this.acting.set(true);
    this.message.set(null);
    this.panelError.set(null);
    request.subscribe({
      next: () => {
        this.acting.set(false);
        this.panel.set(null);
        this.load();
        if (success) {
          this.notices.toast(success, { undo });
        }
      },
      error: (e: unknown) => {
        this.acting.set(false);
        // com o painel aberto o erro fica dentro dele (o da página estaria atrás do fundo do painel)
        const text = messageFor(toProblem(e));
        if (this.panel()) {
          this.panelError.set(text);
        } else {
          this.message.set(text);
        }
      },
    });
  }
}
