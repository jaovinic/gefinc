import { Component, ElementRef, OnDestroy, computed, effect, input, viewChild } from '@angular/core';
import { ArcElement, Chart, DoughnutController, Tooltip } from 'chart.js';
import { formatBRL } from '@gefinc/utils';
import { ChartSlice } from './chart-slice';

Chart.register(DoughnutController, ArcElement, Tooltip);

/** Rosca de gastos por categoria, com a cor de cada categoria e uma legenda acessível com os valores. */
@Component({
  selector: 'gef-category-donut',
  template: `
    <div class="flex flex-col items-center gap-4 sm:flex-row">
      <div class="relative h-56 w-56 shrink-0">
        <canvas #canvas role="img" [attr.aria-label]="summary()"></canvas>
      </div>
      <ul class="w-full space-y-2 text-body-base" aria-label="Legenda do gráfico por categoria">
        @for (slice of slices(); track slice.label) {
          <li class="flex items-center justify-between gap-3">
            <span class="flex items-center gap-2">
              <span class="h-3 w-3 rounded-full" [style.background]="slice.color" aria-hidden="true"></span>
              {{ slice.label }}
            </span>
            <span class="financial-value">{{ money(slice.value) }}</span>
          </li>
        }
      </ul>
    </div>
  `,
})
export class CategoryDonut implements OnDestroy {
  readonly slices = input.required<ChartSlice[]>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart | null = null;

  protected readonly summary = computed(
    () => 'Gastos por categoria: ' + this.slices().map((s) => `${s.label} ${formatBRL(s.value)}`).join('; '),
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
            borderColor: '#131b2e',
            borderWidth: 2,
          },
        ],
      };
      if (this.chart) {
        this.chart.data = data;
        this.chart.update();
        return;
      }
      this.chart = new Chart(this.canvas().nativeElement, {
        type: 'doughnut',
        data,
        options: { cutout: '68%', plugins: { legend: { display: false } }, maintainAspectRatio: false },
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
