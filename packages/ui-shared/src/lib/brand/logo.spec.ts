import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Logo } from './logo';

@Component({
  imports: [Logo],
  template: `
    <gef-logo />
    <gef-logo variant="symbol" [size]="48" />
    <gef-logo variant="full" />
  `,
})
class Host {}

describe('gef-logo', () => {
  function render(): HTMLElement[] {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('gef-logo'));
  }

  it('mostra o símbolo com nome acessível GEFINC', () => {
    const [, symbol] = render();
    const svg = symbol.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('GEFINC');
    expect(symbol.textContent?.trim()).toBe('');
  });

  it('a variante com nome mostra o texto GEFINC visível', () => {
    const [fallback, , full] = render();
    expect(full.textContent).toContain('GEFINC');
    expect(fallback.textContent).toContain('GEFINC');
  });

  it('respeita o tamanho informado', () => {
    const [, symbol] = render();
    expect(symbol.querySelector('svg')?.getAttribute('height')).toBe('48');
  });

  it('cada logo usa um gradiente com identificador próprio', () => {
    const ids = render().map((el) => el.querySelector('linearGradient')?.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
