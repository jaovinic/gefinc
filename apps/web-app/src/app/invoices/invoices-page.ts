import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Invoice, InvoiceProjection, Transaction } from '@gefinc/core-models';
import {
  EmptyView,
  ErrorView,
  InvoicesApi,
  LoadingView,
  MoneyInput,
  MonthPicker,
  NoticeService,
  ReferenceData,
  messageFor,
  toProblem,
} from '@gefinc/ui-shared';
import { currentMonth, formatBRL, isoToBR, todayIso } from '@gefinc/utils';

/** Faturas de cartão: itens, pagamento parcial ou total, desfazer e projeção dos próximos meses (FR-027, FR-034 a FR-039). */
@Component({
  selector: 'gef-invoices-page',
  imports: [FormsModule, EmptyView, ErrorView, LoadingView, MoneyInput, MonthPicker],
  template: `
    <section class="space-y-6">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-title-lg font-bold">Faturas</h1>
        <div class="flex items-center gap-3">
          <select class="gef-input" aria-label="Cartão" [ngModel]="cardId()" (ngModelChange)="cardId.set(+$event)">
            @for (card of cards(); track card.id) {
              <option [value]="card.id">{{ card.name }}</option>
            }
          </select>
          <gef-month-picker [(value)]="month" />
        </div>
      </header>

      @if (message(); as text) {
        <p class="gef-alert-error" role="alert">{{ text }}</p>
      }

      @if (cards().length === 0) {
        <gef-empty title="Nenhum cartão cadastrado" hint="Cadastre um cartão de crédito em Contas para acompanhar as faturas." />
      } @else if (loading()) {
        <gef-loading message="Carregando fatura…" />
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" (retry)="load()" />
      } @else if (invoice(); as inv) {
        <div class="grid gap-4 sm:grid-cols-4">
          <div class="rounded-xl border border-gefinc-border bg-gefinc-surface p-4">
            <p class="text-caption text-gefinc-muted">Total da fatura</p>
            <p class="financial-value text-title-lg font-bold">{{ money(inv.total) }}</p>
          </div>
          <div class="rounded-xl border border-gefinc-border bg-gefinc-surface p-4">
            <p class="text-caption text-gefinc-muted">Pago</p>
            <p class="financial-value text-title-lg font-bold text-gefinc-primary">{{ money(paid(inv)) }}</p>
          </div>
          <div class="rounded-xl border border-gefinc-border bg-gefinc-surface p-4">
            <p class="text-caption text-gefinc-muted">Restante</p>
            <p class="financial-value text-title-lg font-bold" [class.text-gefinc-warning]="inv.remaining !== '0.00'">{{ money(inv.remaining) }}</p>
          </div>
          <div class="rounded-xl border border-gefinc-border bg-gefinc-surface p-4">
            <p class="text-caption text-gefinc-muted">Vencimento</p>
            <p class="text-title-lg font-bold">{{ br(inv.dueDate) }}</p>
          </div>
        </div>

        @if (inv.items.length > 0 && inv.remaining !== '0.00') {
          <div class="flex gap-3">
            <button type="button" class="gef-btn-secondary" (click)="openPayment('partial')">Pagar parte</button>
            <button type="button" class="gef-btn-secondary" (click)="openPayment('settle')">Quitar fatura</button>
          </div>
        }

        @if (paymentMode(); as mode) {
          <div class="space-y-3 rounded-xl border border-gefinc-border bg-gefinc-surface p-4" role="dialog" aria-label="Pagamento da fatura">
            @if (mode === 'partial') {
              <p>Quanto você vai pagar agora? (restante: {{ money(inv.remaining) }})</p>
              <gef-money-input label="Valor do pagamento" [ngModel]="paymentAmount()" (ngModelChange)="paymentAmount.set($event)" />
            } @else {
              <p>Quitar a fatura pelo restante de <strong>{{ money(inv.remaining) }}</strong>?</p>
            }
            <label class="gef-label" for="paidAt">Data do pagamento</label>
            <input id="paidAt" class="gef-input max-w-48" type="date" [(ngModel)]="paidAt" />
            <div class="flex gap-3">
              <button type="button" class="gef-btn-primary max-w-40" (click)="confirmPayment(inv)">Confirmar</button>
              <button type="button" class="gef-btn-secondary" (click)="paymentMode.set(null)">Cancelar</button>
            </div>
          </div>
        }

        @if (inv.items.length === 0) {
          <gef-empty title="Fatura sem lançamentos" hint="Nenhuma compra neste cartão vence neste mês." />
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
                      <span class="rounded-full border px-2 py-0.5 text-micro font-bold uppercase" [class]="badge(item).css">{{ badge(item).label }}</span>
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
                  <button type="button" class="gef-link" (click)="undo(payment.id)">Desfazer</button>
                </li>
              }
            </ul>
          </div>
        }
      }

      @if (projection(); as proj) {
        <div>
          <h2 class="mb-2 text-title-md font-semibold">Projeção das próximas faturas</h2>
          <div class="overflow-x-auto rounded-xl border border-gefinc-border">
            <table class="w-full text-left text-body-base" aria-label="Projeção de faturas">
              <thead class="bg-gefinc-surface text-caption uppercase text-gefinc-muted">
                <tr>
                  <th class="px-4 py-3">Cartão</th>
                  @for (m of proj.months; track m) {
                    <th class="px-4 py-3 text-right">{{ m }}</th>
                  }
                  <th class="px-4 py-3 text-right">Comprometido</th>
                </tr>
              </thead>
              <tbody>
                @for (card of proj.cards; track card.accountId) {
                  <tr class="border-t border-gefinc-border">
                    <td class="px-4 py-3 font-medium">{{ card.name }}</td>
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
        </div>
      }
    </section>
  `,
})
export class InvoicesPage implements OnInit {
  private readonly api = inject(InvoicesApi);
  private readonly notices = inject(NoticeService);
  protected readonly reference = inject(ReferenceData);

  protected readonly month = signal(currentMonth());
  protected readonly cardId = signal(0);
  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly projection = signal<InvoiceProjection | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly paymentMode = signal<'partial' | 'settle' | null>(null);
  protected readonly paymentAmount = signal<string | null>(null);
  protected paidAt = todayIso();

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
      if (this.notices.staleVersionCount() > 0) {
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

  protected badge(item: Transaction): { label: string; css: string } {
    if (item.status === 'PAID') {
      return { label: 'Pago', css: 'border-gefinc-primary/25 bg-gefinc-primary/10 text-gefinc-primary' };
    }
    if (item.overdue) {
      return { label: 'Vencido', css: 'border-gefinc-danger/25 bg-gefinc-danger/10 text-gefinc-danger' };
    }
    return { label: 'Pend', css: 'border-gefinc-warning/25 bg-gefinc-warning/10 text-gefinc-warning' };
  }

  protected openPayment(mode: 'partial' | 'settle'): void {
    this.message.set(null);
    this.paidAt = todayIso();
    this.paymentAmount.set(null);
    this.paymentMode.set(mode);
  }

  protected confirmPayment(invoice: Invoice): void {
    const mode = this.paymentMode();
    const amount = this.paymentAmount();
    if (mode === 'partial' && !amount) {
      this.message.set('Informe o valor do pagamento.');
      return;
    }
    const request =
      mode === 'settle'
        ? this.api.settle(invoice.accountId, invoice.month, this.paidAt)
        : this.api.pay(invoice.accountId, invoice.month, amount as string, this.paidAt);
    this.message.set(null);
    request.subscribe({
      next: () => this.load(),
      error: (e: unknown) => this.message.set(messageFor(toProblem(e))),
    });
  }

  protected undo(paymentId: number): void {
    this.message.set(null);
    this.api.undoPayment(paymentId).subscribe({
      next: () => this.load(),
      error: (e: unknown) => this.message.set(messageFor(toProblem(e))),
    });
  }
}
