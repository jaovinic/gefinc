const created: { type: string; data: { labels: string[]; datasets: { data: number[]; backgroundColor: string[] }[] }; destroyed: boolean; updated: number }[] = [];

jest.mock('chart.js', () => {
  class Chart {
    static register = jest.fn();
    data: unknown;
    record: (typeof created)[number];
    constructor(_canvas: unknown, config: { type: string; data: (typeof created)[number]['data'] }) {
      this.record = { type: config.type, data: config.data, destroyed: false, updated: 0 };
      this.data = config.data;
      created.push(this.record);
    }
    update() {
      this.record.updated++;
      this.record.data = this.data as (typeof created)[number]['data'];
    }
    destroy() {
      this.record.destroyed = true;
    }
  }
  return {
    Chart,
    DoughnutController: {},
    ArcElement: {},
    BarController: {},
    BarElement: {},
    CategoryScale: {},
    LinearScale: {},
    Tooltip: {},
  };
});

import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CardBars } from './card-bars';
import { CategoryDonut } from './category-donut';
import { ChartSlice } from './chart-slice';

const slices: ChartSlice[] = [
  { label: 'Alimentação', value: '240.50', color: '#F97316' },
  { label: 'Lazer', value: '40.00', color: '#EC4899' },
];

@Component({
  imports: [CategoryDonut, CardBars],
  template: `<gef-category-donut [slices]="data()" /><gef-card-bars [slices]="data()" />`,
})
class Host {
  data = signal<ChartSlice[]>(slices);
}

describe('gráficos', () => {
  beforeEach(() => (created.length = 0));

  it('rosca e barras usam os valores e as cores recebidos', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(created.map((c) => c.type)).toEqual(['doughnut', 'bar']);
    expect(created[0].data.labels).toEqual(['Alimentação', 'Lazer']);
    expect(created[0].data.datasets[0].data).toEqual([240.5, 40]);
    expect(created[0].data.datasets[0].backgroundColor).toEqual(['#F97316', '#EC4899']);
  });

  it('mostra legenda acessível com os valores em reais e descrição para leitores de tela', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[aria-label="Legenda do gráfico por categoria"]')?.textContent).toContain('R$ 240,50');
    expect(el.querySelector('canvas[role="img"]')?.getAttribute('aria-label')).toContain('Gastos por categoria: Alimentação R$ 240,50');
  });

  it('atualiza o gráfico existente quando os dados mudam e o destrói ao sair', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.data.set([{ label: 'Moradia', value: '100.00', color: '#8B5CF6' }]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(created).toHaveLength(2); // não recria
    expect(created[0].updated).toBe(1);
    expect(created[0].data.datasets[0].data).toEqual([100]);

    fixture.destroy();
    expect(created.every((c) => c.destroyed)).toBe(true);
  });
});
