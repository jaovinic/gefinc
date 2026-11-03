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

  it('a rosca usa os valores e as cores recebidos', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(created.map((c) => c.type)).toEqual(['doughnut']);
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

  it('a legenda mostra o percentual de cada fatia (pista além da cor) e as raízes são de bloco', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const percents = Array.from(el.querySelectorAll('[data-testid="slice-percent"]')).map((p) => p.textContent?.trim());
    expect(percents).toEqual(['86%', '14%']);
    expect(el.querySelector('gef-category-donut')?.className).toContain('block');
    expect(el.querySelector('gef-card-bars')?.className).toContain('block');

    fixture.componentInstance.data.set([
      { label: 'Moradia', value: '1000.00', color: '#8B5CF6' },
      { label: 'Compras', value: '1.00', color: '#A855F7' },
    ]);
    fixture.detectChanges();
    expect(Array.from(el.querySelectorAll('[data-testid="slice-percent"]')).map((p) => p.textContent?.trim())).toEqual(['100%', '<1%']);
  });

  it('atualiza o gráfico existente quando os dados mudam e o destrói ao sair', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.data.set([{ label: 'Moradia', value: '100.00', color: '#8B5CF6' }]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(created).toHaveLength(1); // não recria
    expect(created[0].updated).toBe(1);
    expect(created[0].data.datasets[0].data).toEqual([100]);

    fixture.destroy();
    expect(created.every((c) => c.destroyed)).toBe(true);
  });
});

describe('distribuição por cartão (barras em HTML)', () => {
  function render(data: ChartSlice[]) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.data.set(data);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('com um só cartão mostra 100% e nenhuma linha de total', () => {
    const el = render([{ label: 'Nubank', value: '320.50', color: '#7c3aed', icon: 'card-gold' }]);
    const rows = el.querySelectorAll('[data-testid="card-share-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Nubank');
    expect(rows[0].textContent).toContain('R$ 320,50');
    expect(rows[0].textContent).toContain('100%');
    expect(el.textContent).not.toContain('Total nos cartões');
  });

  it('com vários cartões mostra a participação de cada um e o total', () => {
    const el = render([
      { label: 'Nubank', value: '300.00', color: '#7c3aed' },
      { label: 'Inter', value: '100.00', color: '#00b4d8' },
    ]);
    const text = Array.from(el.querySelectorAll('[data-testid="card-share-row"]')).map((r) => r.textContent);
    expect(text[0]).toContain('75%');
    expect(text[1]).toContain('25%');
    expect(el.textContent).toContain('Total nos cartões');
    expect(el.textContent).toContain('R$ 400,00');
    const bars = el.querySelectorAll<HTMLElement>('li [role="img"] > div');
    expect(bars[0].style.width).toBe('75%');
  });

  it('cada barra tem descrição para leitores de tela', () => {
    const el = render([{ label: 'Nubank', value: '10.00', color: '#7c3aed' }]);
    expect(el.querySelector('li [role="img"]')?.getAttribute('aria-label')).toBe('Nubank: 100% do total em cartões');
  });
});
