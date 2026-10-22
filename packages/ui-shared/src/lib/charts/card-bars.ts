import { Component, ElementRef, OnDestroy, computed, effect, input, viewChild } from '@angular/core';
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';
import { formatBRL } from '@gefinc/utils';
import { Icon } from '../icons/icon';
import { ChartSlice } from './chart-slice';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

/** Barras horizontais da distribuição dos gastos por cartão, com legenda acessível dos valores. */
@Component({
  selector: 'gef-card-bars',
  imports: [Icon],
  template: `
    <div class="space-y-4">
      <div class="relative" [style.height.px]="height()">
        <canvas #canvas role="img" [attr.aria-label]="summary()"></canvas>
      </div>
      <ul class="space-y-1 text-body-base" aria-label="Legenda do gráfico por cartão">
        @for (slice of slices(); track slice.label) {
          <li class="flex items-center justify-between gap-3">
            <span class="flex items-center gap-2">
              @if (slice.icon) {
                <span class="gef-account-tile text-gefinc-accent"><gef-icon [name]="slice.icon" [size]="16" /></span>
              }
              {{ slice.label }}
            </span>
            <span class="financial-value">{{ money(slice.value) }}</span>
          </li>
        }
      </ul>
    </div>
  `,
})
export class CardBars implements OnDestroy {
  readonly slices = input.required<ChartSlice[]>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart | null = null;

  protected readonly height = computed(() => Math.max(80, this.slices().length * 44));
  protected readonly summary = computed(
    () => 'Gastos por cartão: ' + this.slices().map((s) => `${s.label} ${formatBRL(s.value)}`).join('; '),
  );

  constructor() {
    effect(() => {
      const slices = this.slices();
      const data = {
        labels: slices.map((s) => s.label),
        datasets: [
          {
            data: slices.map((s) => Number(s.value)),
            backgroundColor: slices.map((s) => s.color),
            borderRadius: 6,
          },
        ],
      };
      if (this.chart) {
        this.chart.data = data;
        this.chart.update();
        return;
      }
      this.chart = new Chart(this.canvas().nativeElement, {
        type: 'bar',
        data,
        options: {
          indexAxis: 'y',
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { display: false }, y: { ticks: { color: '#94a3b8' }, grid: { display: false } } },
        },
      });
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  protected money(value: string): string {
    return formatBRL(value);
  }
}
