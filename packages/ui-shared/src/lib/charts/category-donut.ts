import { Component, ElementRef, OnDestroy, computed, effect, inject, input, viewChild } from '@angular/core';
import { ArcElement, Chart, DoughnutController, Tooltip } from 'chart.js';
import { formatBRL } from '@gefinc/utils';
import { ThemeService } from '../theme/theme.service';
import { ChartSlice } from './chart-slice';

Chart.register(DoughnutController, ArcElement, Tooltip);

/** Rosca de gastos por categoria, com a cor de cada categoria e uma legenda acessível com os valores. */
@Component({
  selector: 'gef-category-donut',
  host: { class: 'block' },
  template: `
    <div class="flex flex-col items-center gap-4 sm:flex-row">
      <div class="relative h-56 w-56 shrink-0">
        <canvas #canvas role="img" [attr.aria-label]="summary()"></canvas>
      </div>
      <ul class="w-full space-y-2 text-body-base" aria-label="Legenda do gráfico por categoria">
        @for (slice of slices(); track slice.label) {
          <li class="flex items-center justify-between gap-3">
            <span class="flex min-w-0 items-center gap-2">
              <span class="h-3 w-3 shrink-0 rounded-full" [style.background]="slice.color" aria-hidden="true"></span>
              <span class="min-w-0 break-words">{{ slice.label }}</span>
            </span>
            <span class="flex shrink-0 items-baseline gap-2">
              <span class="text-caption text-gefinc-muted" data-testid="slice-percent">{{ percent(slice) }}</span>
              <span class="financial-value">{{ money(slice.value) }}</span>
            </span>
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
  private readonly theme = inject(ThemeService);

  protected readonly summary = computed(
    () => 'Gastos por categoria: ' + this.slices().map((s) => `${s.label} ${formatBRL(s.value)}`).join('; '),
  );

  constructor() {
    effect(() => {
      const slices = this.slices();
      this.theme.resolved(); // o canvas não herda o CSS: ao trocar o tema, a borda é lida de novo
      const data = {
        labels: slices.map((s) => s.label),
        datasets: [
          {
            data: slices.map((s) => Number(s.value)),
            backgroundColor: slices.map((s) => s.color),
            borderColor: this.borderColor(),
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

  /** Cor da borda entre as fatias, lida do token do tema (o canvas não usa CSS). */
  private borderColor(): string {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--color-gefinc-chart-border').trim();
    return value || '#131b2e';
  }

  protected money(value: string): string {
    return formatBRL(value);
  }

  /** Participação da fatia no total, como pista além da cor (fatias de cores próximas). */
  protected percent(slice: ChartSlice): string {
    const total = this.slices().reduce((sum, s) => sum + Number(s.value), 0);
    const share = total > 0 ? (Number(slice.value) / total) * 100 : 0;
    if (share > 0 && share < 1) {
      return '<1%';
    }
    return `${Math.round(share)}%`;
  }
}
