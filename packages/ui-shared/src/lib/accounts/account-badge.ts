import { Component, computed, input } from '@angular/core';
import type { Account } from '@gefinc/core-models';
import { defaultIconFor } from '@gefinc/utils';
import { Icon } from '../icons/icon';

/** Dados mínimos de uma conta para exibi-la; cópias locais antigas podem não ter os campos novos. */
export type AccountLike = Pick<Account, 'name' | 'type'> &
  Partial<Pick<Account, 'holderType' | 'icon' | 'bankAccountId' | 'bankAccountName'>>;

/**
 * Identificação visual de uma conta ou cartão: ícone, nome e, se pedido, o selo PF/PJ e a conta
 * bancária do cartão. Usada em listas, tabelas, escolhas e extratos (FR-003, FR-014, FR-016).
 */
@Component({
  selector: 'gef-account-badge',
  imports: [Icon],
  template: `
    <span class="flex min-w-0 items-center gap-2">
      <span class="gef-account-tile" [class]="tone()"><gef-icon [name]="iconName()" [size]="18" /></span>
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="flex min-w-0 items-center gap-2">
          <span class="truncate font-medium" data-name [attr.title]="account().name">{{ account().name }}</span>
          @if (showHolder() && account().holderType; as holder) {
            <span class="gef-pill" [class.gef-pill-pj]="holder === 'PJ'" data-holder>{{ holder }}</span>
          }
        </span>
        @if (showBank() && account().type === 'CREDIT_CARD') {
          @if (account().bankAccountName; as bank) {
            <span class="truncate text-caption text-gefinc-muted" data-bank>{{ bank }}</span>
          } @else {
            <span class="text-caption text-gefinc-warning" data-unlinked>vincule a uma conta bancária</span>
          }
        }
      </span>
    </span>
  `,
  host: { class: 'block min-w-0' },
})
export class AccountBadge {
  readonly account = input.required<AccountLike>();
  readonly showHolder = input(true);
  readonly showBank = input(false);

  protected readonly iconName = computed(() => {
    const a = this.account();
    return a.icon ?? defaultIconFor(a.type, a.holderType);
  });

  protected readonly tone = computed(() => {
    const a = this.account();
    if (a.type === 'CREDIT_CARD') {
      return 'text-gefinc-accent';
    }
    if (a.type === 'CASH') {
      return 'text-gefinc-warning';
    }
    return a.holderType === 'PJ' ? 'text-gefinc-secondary' : 'text-gefinc-primary';
  });
}
