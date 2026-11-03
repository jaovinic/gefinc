import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Invoice, InvoicePayment, InvoiceProjection, Transaction } from '@gefinc/core-models';
import { InvoicesApi, NoticeService, ReferenceData, messageFor, toProblem } from '../api';
import { AccountBadge, type AccountLike } from '../accounts/account-badge';
import { AccountPicker } from '../accounts/account-picker';
import { DateField } from '../date-field/date-field';
import { Icon } from '../icons/icon';
import { ConfirmDialog } from '../layout/confirm-dialog';
import { Sheet } from '../layout/sheet';
import { MoneyInput } from '../money-input/money-input';
import { MonthPicker } from '../month-picker/month-picker';
import { EmptyView, ErrorView, LoadingView } from '../state-views/state-views';
import { Viewport } from '../viewport/viewport';
import { currentMonth, formatBRL, isoToBR, monthLabelBR, todayIso } from '@gefinc/utils';

/** Faturas de cartão: itens, pagamento parcial ou total, desfazer e projeção dos próximos meses (FR-027, FR-034 a FR-039). */
@Component({
  selector: 'gef-invoices-page',
  imports: [AccountBadge, AccountPicker, ConfirmDialog, DateField, FormsModule, Icon, NgTemplateOutlet, EmptyView, ErrorView, LoadingView, MoneyInput, MonthPicker, Sheet],
  template: `
    <section class="space-y-6">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-title-lg font-bold">Faturas</h1>
        <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
          <div class="w-full min-w-0 sm:w-72">
            <gef-account-picker label="Cartão" [accounts]="cards()" [ngModel]="cardId()" (ngModelChange)="cardId.set(+$event)" />
          </div>
          <gef-month-picker [(value)]="month" />
        </div>
      </header>

      @if (message(); as text) {
        <p class="gef-alert-error" role="alert">{{ text }}</p>
      }

      @if (cards().length === 0) {
        <gef-empty icon="invoice" title="Nenhum cartão cadastrado" hint="Cadastre um cartão de crédito em Contas para acompanhar as faturas." />
      } @else if (loading()) {
        <gef-loading message="Carregando fatura…" />
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" (retry)="load()" />
      } @else if (invoice(); as inv) {
        <div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <div class="gef-kpi gef-card p-4">
            <p class="text-caption text-gefinc-muted">Total da fatura</p>
            <p class="financial-value text-title-lg font-bold">{{ money(inv.total) }}</p>
          </div>
          <div class="gef-kpi gef-card p-4">
            <p class="text-caption text-gefinc-muted">Pago</p>
            <p class="financial-value text-title-lg font-bold text-gefinc-primary">{{ money(paid(inv)) }}</p>
          </div>
          <div class="gef-kpi gef-card p-4">
            <p class="text-caption text-gefinc-muted">Restante</p>
            <p class="financial-value text-title-lg font-bold" [class.text-gefinc-warning]="inv.remaining !== '0.00'">{{ money(inv.remaining) }}</p>
          </div>
          <div class="gef-kpi gef-card p-4">
            <p class="text-caption text-gefinc-muted">Vencimento</p>
            <p class="financial-value text-title-lg font-bold">{{ br(inv.dueDate) }}</p>
          </div>
        </div>

        @if (inv.items.length > 0 && inv.remaining !== '0.00') {
          <div class="flex flex-wrap gap-3">
            <button type="button" class="gef-btn-secondary" (click)="openPayment('partial')">Pagar parte</button>
            <button type="button" class="gef-btn-secondary" (click)="openPayment('settle')">Quitar fatura</button>
          </div>
        }

        <ng-template #paymentTpl let-mode>
          @if (mode === 'partial') {
            <p>Quanto você vai pagar agora? (restante: {{ money(inv.remaining) }})</p>
            <gef-money-input label="Valor do pagamento" [ngModel]="paymentAmount()" (ngModelChange)="paymentAmount.set($event); paymentError.set(null)" />
          } @else {
            <p>Quitar a fatura pelo restante de <strong>{{ money(inv.remaining) }}</strong>?</p>
          }
          <gef-date-field
            class="max-w-56"
            inputId="paidAt"
            label="Data do pagamento"
            [describedBy]="paymentError() ? 'payment-error' : null"
            [ngModel]="paidAt"
            (ngModelChange)="paidAt = $event; paymentError.set(null)"
          />
          @if (paymentError(); as text) {
            <p id="payment-error" class="gef-field-error" role="alert">{{ text }}</p>
          }
          <div class="flex gap-3">
            <button type="button" class="gef-btn-primary max-w-40" (click)="confirmPayment(inv)">Confirmar</button>
            <button type="button" class="gef-btn-secondary" (click)="paymentMode.set(null)">Cancelar</button>
          </div>
        </ng-template>
        @if (paymentMode(); as mode) {
          @if (viewport.compact()) {
            <gef-sheet heading="Pagamento da fatura" [open]="true" (closed)="paymentMode.set(null)">
              <div class="space-y-3"><ng-container *ngTemplateOutlet="paymentTpl; context: { $implicit: mode, inv: inv }" /></div>
            </gef-sheet>
          } @else {
            <div class="space-y-3 gef-card p-4" role="dialog" aria-label="Pagamento da fatura">
              <ng-container *ngTemplateOutlet="paymentTpl; context: { $implicit: mode, inv: inv }" />
            </div>
          }
        }

        @if (inv.items.length === 0) {
          <gef-empty icon="invoice" title="Fatura sem lançamentos" hint="Nenhuma compra neste cartão vence neste mês." />
        } @else if (viewport.compact()) {
          <ul class="space-y-3">
            @for (item of inv.items; track item.id) {
              <li data-testid="invoice-item" class="flex items-start justify-between gap-3 gef-card p-4">
                <div class="min-w-0">
                  <p class="font-semibold">{{ item.description }}</p>
                  <p class="text-caption text-gefinc-muted">
                    {{ br(item.dueDate) }}
                    @if (installmentLabel(item) !== '—') {
                      · {{ installmentLabel(item) }}
                    }
                  </p>
                </div>
                <div class="shrink-0 text-right">
                  <p class="financial-value font-bold">{{ money(item.amount) }}</p>
                  <span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-micro font-bold uppercase" [class]="badge(item).css"><gef-icon [name]="badge(item).icon" [size]="12" />{{ badge(item).label }}</span>
                </div>
              </li>
            }
          </ul>
        } @else {
          <div class="overflow-x-auto rounded-xl border border-gefinc-border">
            <table class="w-full text-left text-body-base">
              <thead class="bg-gefinc-surface text-caption uppercase text-gefinc-muted">
                <tr>
                  <th class="px-4 py-3">Vencimento</th>
                  <th class="px-4 py-3">Descrição</th>
                  <th class="px-4 py-3">Parcela</th>
                  <th class="px-4 py-3 text-right">Valor</th>
                  <th class="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (item of inv.items; track item.id) {
                  <tr class="border-t border-gefinc-border">
                    <td class="px-4 py-3">{{ br(item.dueDate) }}</td>
                    <td class="px-4 py-3 font-medium">{{ item.description }}</td>
                    <td class="px-4 py-3 text-gefinc-muted">{{ installmentLabel(item) }}</td>
                    <td class="financial-value px-4 py-3 text-right">{{ money(item.amount) }}</td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-micro font-bold uppercase" [class]="badge(item).css"><gef-icon [name]="badge(item).icon" [size]="12" />{{ badge(item).label }}</span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        @if (inv.payments.length > 0) {
          <div>
            <h2 class="mb-2 text-title-md font-semibold">Pagamentos da fatura</h2>
            <ul class="divide-y divide-gefinc-border rounded-xl border border-gefinc-border">
              @for (payment of inv.payments; track payment.id) {
                <li class="flex items-center justify-between px-4 py-3">
                  <span>{{ br(payment.paidAt) }} · <span class="financial-value">{{ money(payment.amount) }}</span></span>
                  <button type="button" class="gef-btn-sm" [attr.aria-label]="'Desfazer pagamento de ' + br(payment.paidAt)" (click)="undo(payment)">Desfazer</button>
                </li>
              }
            </ul>
          </div>
        }
      }

      @if (projection(); as proj) {
        <div>
          <h2 class="mb-2 text-title-md font-semibold">Projeção das próximas faturas</h2>
          @if (viewport.compact()) {
            <ul class="space-y-3" aria-label="Projeção de faturas">
              @for (card of proj.cards; track card.accountId) {
                <li data-testid="projection-card" class="gef-card p-4">
                  <div class="flex items-center justify-between gap-3">
                    <gef-account-badge [account]="cardOf(card.accountId, card.name)" [showHolder]="false" />
                    <p class="text-caption text-gefinc-muted">
                      Comprometido <span class="financial-value font-semibold text-gefinc-text">{{ money(card.totalCommitted) }}</span>
                    </p>
                  </div>
                  <div class="mt-2 flex flex-wrap gap-2">
                    @for (inv of card.invoices; track inv.month) {
                      <button
                        type="button"
                        class="gef-action rounded-lg border border-gefinc-border"
                        [attr.aria-label]="'Abrir fatura de ' + card.name + ' em ' + label(inv.month)"
                        (click)="open(card.accountId, inv.month)"
                      >
                        <span class="text-caption text-gefinc-muted">{{ label(inv.month) }}</span>&nbsp;<span class="financial-value">{{ money(inv.remaining) }}</span>
                      </button>
                    }
                  </div>
                </li>
              }
            </ul>
          } @else {
          <div class="overflow-x-auto rounded-xl border border-gefinc-border">
            <table class="w-full text-left text-body-base" aria-label="Projeção de faturas">
              <thead class="bg-gefinc-surface text-caption uppercase text-gefinc-muted">
                <tr>
                  <th class="px-4 py-3">Cartão</th>
                  @for (m of proj.months; track m) {
                    <th class="px-4 py-3 text-right">{{ label(m) }}</th>
                  }
                  <th class="px-4 py-3 text-right">Comprometido</th>
                </tr>
              </thead>
              <tbody>
                @for (card of proj.cards; track card.accountId) {
                  <tr class="border-t border-gefinc-border">
                    <td class="px-4 py-3"><gef-account-badge [account]="cardOf(card.accountId, card.name)" [showHolder]="false" /></td>
                    @for (inv of card.invoices; track inv.month) {
                      <td class="financial-value px-4 py-3 text-right">
                        <button type="button" class="hover:underline" (click)="open(card.accountId, inv.month)">{{ money(inv.remaining) }}</button>
                      </td>
                    }
                    <td class="financial-value px-4 py-3 text-right font-semibold">{{ money(card.totalCommitted) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          }
        </div>
      }
    </section>
    <gef-confirm-dialog
      [open]="!!confirmingUndo()"
      heading="Desfazer pagamento da fatura"
      confirmLabel="Desfazer pagamento"
      busyLabel="Desfazendo…"
      [busy]="acting()"
      [error]="undoError()"
      (confirmed)="confirmUndo()"
      (cancelled)="closeUndo()"
    >
      @if (confirmingUndo(); as payment) {
        <p>Desfazer o pagamento de {{ br(payment.paidAt) }} ({{ money(payment.amount) }})? Os itens que ele quitou voltam a pendentes.</p>
      }
    </gef-confirm-dialog>
  `,
})
export class InvoicesPage implements OnInit {
  private readonly api = inject(InvoicesApi);
  private readonly notices = inject(NoticeService);
  protected readonly reference = inject(ReferenceData);
  protected readonly viewport = inject(Viewport);

  protected readonly month = signal(currentMonth());
  protected readonly cardId = signal(0);
  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly projection = signal<InvoiceProjection | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly paymentMode = signal<'partial' | 'settle' | null>(null);
  /** Pagamento em andamento: toques repetidos não registram de novo. */
  protected readonly acting = signal(false);
  /** Pagamento cujo desfazer aguarda confirmação (o desfazer imediato do aviso não pede). */
  protected readonly confirmingUndo = signal<InvoicePayment | null>(null);
  protected readonly undoError = signal<string | null>(null);
  protected readonly paymentAmount = signal<string | null>(null);
  /** Aviso do painel de pagamento, dentro dele (o aviso da página fica atrás do fundo do painel). */
  protected readonly paymentError = signal<string | null>(null);
  protected paidAt = todayIso();

  /** Cartão para o selo; a projeção traz o nome e a lista de contas, o ícone e o vínculo. */
  protected cardOf(accountId: number, name: string): AccountLike {
    return this.reference.account(accountId) ?? { name, type: 'CREDIT_CARD' };
  }

  protected readonly cards = computed(() => this.reference.accounts().filter((a) => a.type === 'CREDIT_CARD'));

  constructor() {
    // Escolhe o primeiro cartão quando os dados de referência chegam.
    effect(() => {
      const cards = this.cards();
      if (cards.length > 0 && !cards.some((c) => c.id === this.cardId())) {
        this.cardId.set(cards[0].id);
      }
    });
    effect(() => {
      this.cardId();
      this.month();
      untracked(() => this.load());
    });
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
    const cardId = this.cardId();
    if (cardId === 0) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this.paymentMode.set(null);
    this.api.invoice(cardId, this.month()).subscribe({
      next: (invoice) => {
        this.invoice.set(invoice);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.loadError.set(messageFor(toProblem(e)));
        this.loading.set(false);
      },
    });
    this.api.projection(this.month(), 12, cardId).subscribe({
      next: (projection) => this.projection.set(projection),
      error: () => this.projection.set(null),
    });
  }

  protected open(accountId: number, month: string): void {
    this.cardId.set(accountId);
    this.month.set(month);
  }

  protected br(iso: string): string {
    return isoToBR(iso);
  }

  protected label(month: string): string {
    return monthLabelBR(month);
  }

  protected money(value: string): string {
    return formatBRL(value);
  }

  protected paid(invoice: Invoice): string {
    const total = BigInt(invoice.total.replace('.', '')) - BigInt(invoice.remaining.replace('.', ''));
    const negative = total < 0n;
    const abs = negative ? -total : total;
    return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
  }

  protected installmentLabel(item: Transaction): string {
    if (item.recurrenceType === 'INSTALLMENT') {
      return `${item.installmentNumber}/${item.totalInstallments}`;
    }
    return item.recurrenceType === 'FIXED' ? 'Fixo' : '—';
  }

  protected badge(item: Transaction): { label: string; css: string; icon: string } {
    if (item.status === 'PAID') {
      return { label: 'Pago', icon: 'check', css: 'border-gefinc-primary/25 bg-gefinc-primary/10 text-gefinc-primary' };
    }
    if (item.overdue) {
      return { label: 'Vencido', icon: 'alert', css: 'border-gefinc-danger/25 bg-gefinc-danger/10 text-gefinc-danger' };
    }
    return { label: 'Pendente', icon: 'clock', css: 'border-gefinc-warning/25 bg-gefinc-warning/10 text-gefinc-warning' };
  }

  protected openPayment(mode: 'partial' | 'settle'): void {
    this.message.set(null);
    this.paymentError.set(null);
    this.paidAt = todayIso();
    this.paymentAmount.set(null);
    this.paymentMode.set(mode);
  }

  protected confirmPayment(invoice: Invoice): void {
    if (this.acting()) {
      return;
    }
    const mode = this.paymentMode();
    const amount = this.paymentAmount();
    if (mode === 'partial' && !amount) {
      this.paymentError.set('Informe o valor do pagamento.');
      return;
    }
    if (!this.paidAt) {
      this.paymentError.set('Informe uma data válida (dd/mm/aaaa).');
      return;
    }
    const request =
      mode === 'settle'
        ? this.api.settle(invoice.accountId, invoice.month, this.paidAt)
        : this.api.pay(invoice.accountId, invoice.month, amount as string, this.paidAt);
    this.message.set(null);
    this.paymentError.set(null);
    this.acting.set(true);
    request.subscribe({
      next: (updated) => {
        this.acting.set(false);
        this.load();
        // O último pagamento da fatura é o que acabou de ser registrado; "Desfazer" o remove.
        const latest = [...(updated.payments ?? [])].sort((a, b) => b.id - a.id)[0];
        this.notices.toast(mode === 'settle' ? 'Fatura quitada.' : 'Pagamento da fatura registrado.', {
          undo: latest ? () => this.doUndo(latest.id, false) : undefined,
        });
      },
      error: (e: unknown) => {
        this.acting.set(false);
        this.paymentError.set(messageFor(toProblem(e)));
      },
    });
  }

  /** Pede confirmação antes de desfazer um pagamento já registrado. */
  protected undo(payment: InvoicePayment): void {
    this.undoError.set(null);
    this.confirmingUndo.set(payment);
  }

  protected closeUndo(): void {
    if (!this.acting()) {
      this.confirmingUndo.set(null);
      this.undoError.set(null);
    }
  }

  protected confirmUndo(): void {
    const payment = this.confirmingUndo();
    if (!payment || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.undoError.set(null);
    this.api.undoPayment(payment.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.confirmingUndo.set(null);
        this.load();
        this.notices.toast('Pagamento desfeito.');
      },
      error: (e: unknown) => {
        this.acting.set(false);
        this.undoError.set(messageFor(toProblem(e)));
      },
    });
  }

  /** Desfazer sem diálogo: só para o "Desfazer" do aviso logo após registrar o pagamento. */
  protected doUndo(paymentId: number, announce = true): void {
    this.message.set(null);
    this.api.undoPayment(paymentId).subscribe({
      next: () => {
        this.load();
        if (announce) {
          this.notices.toast('Pagamento desfeito.');
        }
      },
      error: (e: unknown) => this.message.set(messageFor(toProblem(e))),
    });
  }
}
