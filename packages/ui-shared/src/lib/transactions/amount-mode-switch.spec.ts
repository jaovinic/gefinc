import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AmountModeSwitch } from './amount-mode-switch';
import type { AmountMode } from './installment-amount';

@Component({
  imports: [AmountModeSwitch],
  template: `<gef-amount-mode-switch [value]="mode()" [count]="count()" [order]="order()" (changed)="last = $event; mode.set($event.mode)" />`,
})
class Host {
  mode = signal<AmountMode>('INSTALLMENT');
  count = signal<number | null>(10);
  order = signal<'installment-first' | 'total-first'>('installment-first');
  last: { mode: AmountMode; byPointer: boolean } | null = null;
}

describe('AmountModeSwitch', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('[aria-label="Forma de informar"] button')];
    return { fixture, el, buttons };
  }

  it('tem legenda visível e um grupo com os dois botões, da parcela primeiro', () => {
    const { el, buttons } = render();

    expect(el.textContent).toContain('O valor digitado é');
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Valor da parcela', 'Valor total']);
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(buttons().every((b) => b.type === 'button' && b.classList.contains('gef-seg-btn'))).toBe(true);
  });

  it('a ordem pode começar pelo total (cadastro completo)', () => {
    const { fixture, buttons } = render();
    fixture.componentInstance.order.set('total-first');
    fixture.detectChanges();

    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Valor total', 'Valor da parcela']);
  });

  it('o texto de apoio descreve o modo e está ligado ao grupo por aria-describedby', () => {
    const { fixture, el } = render();
    const group = el.querySelector('[aria-label="Forma de informar"]') as HTMLElement;
    const help = el.querySelector('[data-testid="amount-mode-help"]') as HTMLElement;

    expect(group.getAttribute('aria-describedby')).toBe(help.id);
    expect(help.textContent).toContain('o valor digitado se repete em 10 vezes');

    fixture.componentInstance.mode.set('TOTAL');
    fixture.detectChanges();
    expect(help.textContent).toContain('é dividido em 10 vezes');
  });

  it('emite o modo e diz se veio de toque (detail > 0) ou de teclado/leitor de tela', () => {
    const { fixture, buttons } = render();

    buttons()[1].dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(fixture.componentInstance.last).toEqual({ mode: 'TOTAL', byPointer: true });

    fixture.detectChanges();
    buttons()[0].dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(fixture.componentInstance.last).toEqual({ mode: 'INSTALLMENT', byPointer: false });
  });

  it('o botão marcado ganha um ícone, além da cor', () => {
    const { buttons } = render();
    expect(buttons()[0].querySelector('svg')).not.toBeNull();
    expect(buttons()[1].querySelector('svg')).toBeNull();
  });
});
