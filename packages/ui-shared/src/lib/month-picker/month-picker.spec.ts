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
