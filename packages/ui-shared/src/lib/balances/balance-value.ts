import { Component, computed, input } from '@angular/core';
import { formatBRL, toCents } from '@gefinc/utils';
import { Icon } from '../icons/icon';

/**
 * Valor de saldo com sinal explícito: verde com seta para cima quando positivo, vermelho com seta para
 * baixo e sinal de menos quando negativo, neutro quando zero. O leitor de tela ouve o sentido do saldo.
 */
@Component({
  selector: 'gef-balance-value',
  imports: [Icon],
  template: `
    <span
      class="financial-value inline-flex items-center gap-1 whitespace-nowrap font-semibold"
      [class.text-gefinc-primary]="tone() === 'positive'"
      [class.text-gefinc-danger]="tone() === 'negative'"
      [attr.data-tone]="tone()"
    >
      @if (tone() === 'positive') {
        <gef-icon name="arrow-up" [size]="14" /><span class="sr-only">Saldo positivo:</span>
      } @else if (tone() === 'negative') {
        <gef-icon name="arrow-down" [size]="14" /><span class="sr-only">Saldo negativo:</span>
      }
      <span>{{ money() }}</span>
    </span>
  `,
})
export class BalanceValue {
  readonly value = input.required<string>();

  protected readonly tone = computed(() => {
    const cents = toCents(this.value());
    return cents > 0n ? 'positive' : cents < 0n ? 'negative' : 'zero';
  });
  protected readonly money = computed(() => formatBRL(this.value()));
}
