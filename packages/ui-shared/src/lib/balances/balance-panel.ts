import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Account, Balances } from '@gefinc/core-models';
import { formatBRL, isoToBR, toCents } from '@gefinc/utils';
import { AccountBadge, type AccountLike } from '../accounts/account-badge';
import { Icon } from '../icons/icon';
import { APP_PATHS } from '../layout/app-paths';

type Tone = 'positive' | 'negative' | 'zero';

function toneOf(value: string): Tone {
  const cents = toCents(value);
  return cents > 0n ? 'positive' : cents < 0n ? 'negative' : 'zero';
}

/**
 * Saldo por conta e saldo geral (soma das contas) até hoje. Apresentação pura: quem carrega o
 * `GET /balances` é a tela. Sinal e ícone reforçam positivo/negativo além da cor.
 */
@Component({
  selector: 'gef-balance-panel',
  host: { class: 'block' },
  imports: [AccountBadge, Icon, RouterLink],
  template: `
    <section class="space-y-3" aria-label="Saldo das contas" data-testid="balance-panel">
      <div
        class="gef-kpi gef-card p-4"
        [class.border-gefinc-danger]="totalTone() === 'negative'"
        data-indicator="balance-total"
      >
        <p class="flex items-center gap-1.5 text-caption text-gefinc-muted"><gef-icon name="wallet" [size]="14" />Saldo geral</p>
        <p
          class="financial-value flex items-center gap-2 text-display-1 font-extrabold"
          [class.text-gefinc-primary]="totalTone() === 'positive'"
          [class.text-gefinc-danger]="totalTone() === 'negative'"
          [attr.data-tone]="totalTone()"
        >
          @if (totalTone() === 'positive') {
            <gef-icon name="arrow-up" [size]="20" /><span class="sr-only">Saldo positivo:</span>
          } @else if (totalTone() === 'negative') {
            <gef-icon name="arrow-down" [size]="20" /><span class="sr-only">Saldo negativo:</span>
          }
          <span>{{ money(data().total) }}</span>
        </p>
        <p class="mt-1 text-caption text-gefinc-muted">até hoje, {{ asOfLabel() }}</p>
      </div>

      @if (rows().length === 0) {
        <div class="rounded-xl border border-dashed border-gefinc-border p-4 text-center" data-testid="balance-empty">
          <p class="text-body-base font-medium">Nenhuma conta cadastrada</p>
          <p class="text-caption text-gefinc-muted">Cadastre uma conta para acompanhar o saldo de cada uma.</p>
          <a class="gef-btn-secondary mt-3 inline-block" [routerLink]="paths.accounts">Cadastrar conta</a>
        </div>
      } @else {
        <ul
          class="divide-y divide-gefinc-border overflow-hidden gef-card sm:grid sm:grid-cols-2 sm:gap-3 sm:divide-y-0 sm:overflow-visible sm:border-0 sm:bg-transparent sm:shadow-none xl:grid-cols-3"
          aria-label="Saldo por conta"
        >
          @for (row of rows(); track row.accountId) {
            <li
              class="flex items-center justify-between gap-3 p-3 sm:rounded-xl sm:border sm:border-gefinc-border sm:bg-(--glass-bg)"
              data-testid="account-balance"
              [attr.data-account-id]="row.accountId"
            >
              <gef-account-badge class="min-w-0 flex-1" [account]="row.account" [showHolder]="true" />
              <span
                class="financial-value shrink-0 whitespace-nowrap font-semibold"
                [class.text-gefinc-danger]="row.tone === 'negative'"
                [class.text-gefinc-primary]="row.tone === 'positive'"
                data-balance
                >{{ money(row.balance) }}</span
              >
            </li>
          }
        </ul>
      }

      @if (hasUnlinked()) {
        <p class="flex items-start gap-1.5 text-caption text-gefinc-muted" data-testid="unlinked-note">
          <gef-icon class="mt-px shrink-0" name="info" [size]="14" />
          <span>{{ money(data().unlinkedCardPayments) }} em pagamentos de cartões sem conta vinculada não entram no saldo.</span>
        </p>
      }
    </section>
  `,
})
export class BalancePanel {
  protected readonly paths = inject(APP_PATHS);

  readonly data = input.required<Balances>();
  /** Contas completas (ícone e titular escolhidos); sem elas o selo usa o padrão do tipo. */
  readonly accounts = input<Account[]>([]);

  protected readonly totalTone = computed(() => toneOf(this.data().total));
  protected readonly asOfLabel = computed(() => isoToBR(this.data().asOf).slice(0, 5));
  protected readonly hasUnlinked = computed(() => toCents(this.data().unlinkedCardPayments) > 0n);

  /** Uma linha por conta; conta inativa com saldo zero fica oculta. */
  protected readonly rows = computed(() => {
    const known = new Map(this.accounts().map((a) => [a.id, a]));
    return this.data()
      .accounts.filter((a) => a.active || toCents(a.balance) !== 0n)
      .map((a) => {
        const full = known.get(a.accountId);
        const account: AccountLike = full ?? { name: a.name, type: a.type };
        return { accountId: a.accountId, account, balance: a.balance, tone: toneOf(a.balance) };
      });
  });

  protected money(value: string): string {
    return formatBRL(value);
  }
}
