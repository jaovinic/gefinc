import { Component, computed, input } from '@angular/core';
import { formatBRL } from '@gefinc/utils';
import { Icon } from '../icons/icon';
import { ChartSlice } from './chart-slice';

/**
 * Distribuição dos gastos por cartão: uma linha por cartão (ícone, nome, valor) com uma barra de
 * participação e o percentual do total. Feita em HTML, sem canvas, para ler bem com um ou vários cartões
 * e em qualquer largura de tela.
 */
@Component({
  selector: 'gef-card-bars',
  host: { class: 'block' },
  imports: [Icon],
  template: `
    <ul class="space-y-4" aria-label="Legenda do gráfico por cartão" data-testid="card-share">
      @for (row of rows(); track row.label) {
        <li data-testid="card-share-row">
          <div class="mb-1.5 flex items-center justify-between gap-3">
            <span class="flex min-w-0 items-center gap-2">
              <span class="gef-account-tile text-gefinc-accent"><gef-icon [name]="row.icon" [size]="18" /></span>
              <span class="truncate font-medium" [attr.title]="row.label">{{ row.label }}</span>
            </span>
            <span class="financial-value shrink-0 font-semibold">{{ row.money }}</span>
          </div>
          <div class="flex items-center gap-3">
            <div
              class="h-2.5 flex-1 overflow-hidden rounded-full bg-gefinc-bg"
              role="img"
              [attr.aria-label]="row.label + ': ' + row.percent + '% do total em cartões'"
            >
              <div class="h-full rounded-full" [style.width.%]="row.width" [style.background]="row.color"></div>
            </div>
            <span class="w-10 shrink-0 text-right text-caption text-gefinc-muted">{{ row.percent }}%</span>
          </div>
        </li>
      }
    </ul>
    @if (rows().length > 1) {
      <p class="mt-4 flex items-center justify-between border-t border-gefinc-border pt-3 text-body-base text-gefinc-muted">
        <span>Total nos cartões</span>
        <span class="financial-value font-semibold text-gefinc-text">{{ total() }}</span>
      </p>
    }
  `,
})
export class CardBars {
  readonly slices = input.required<ChartSlice[]>();

  private readonly sum = computed(() => this.slices().reduce((acc, s) => acc + Number(s.value), 0));

  protected readonly total = computed(() => formatBRL(this.sum().toFixed(2)));
  protected readonly rows = computed(() => {
    const sum = this.sum();
    return this.slices().map((s) => {
      const share = sum > 0 ? (Number(s.value) / sum) * 100 : 0;
      return {
        label: s.label,
        icon: s.icon ?? 'card',
        color: s.color,
        money: formatBRL(s.value),
        percent: Math.round(share),
        // barras muito pequenas continuam visíveis
        width: Math.max(share, share > 0 ? 3 : 0),
      };
    });
  });
}
