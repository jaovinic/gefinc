import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MonthPicker } from './month-picker';

@Component({
  imports: [MonthPicker],
  template: `<gef-month-picker [(value)]="month" />`,
})
class Host {
  month = signal('2026-12');
}

describe('MonthPicker', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const click = async (label: string) => {
      (el.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { fixture, el, click };
  }

  it('no celular ocupa a largura toda (o elemento é de bloco) e a partir de sm volta ao tamanho do conteúdo', async () => {
    const { el } = await setup();
    const host = el.querySelector('gef-month-picker') as HTMLElement;
    expect(host.className).toContain('block');
    expect(host.className).toContain('w-full');
    expect(host.className).toContain('sm:w-auto');
    expect(host.firstElementChild?.className).toContain('w-full');
  });

  it('mostra o mês por extenso em português', async () => {
    const { el } = await setup();
    expect(el.textContent).toContain('dezembro de 2026');
  });

  it('avança pela virada de ano e volta', async () => {
    const { fixture, el, click } = await setup();

    await click('Próximo mês');
    expect(fixture.componentInstance.month()).toBe('2027-01');
    expect(el.textContent).toContain('janeiro de 2027');

    await click('Mês anterior');
    await click('Mês anterior');
    expect(fixture.componentInstance.month()).toBe('2026-11');
  });
});
