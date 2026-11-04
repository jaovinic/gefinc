import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeToggle } from './theme-toggle';
import { ThemeService } from './theme.service';

@Component({
  imports: [ThemeToggle],
  template: `<gef-theme-toggle /><gef-theme-toggle variant="icon" />`,
})
class Host {}

describe('ThemeToggle', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, service: TestBed.inject(ThemeService) };
  }

  it('variante segmentada: grupo de rádios Claro, Escuro e Sistema com ícone e texto', () => {
    const { el } = render();
    const group = el.querySelector('[role="radiogroup"]') as HTMLElement;
    const labels = [...group.querySelectorAll('label')];

    expect(group.getAttribute('aria-label')).toBe('Aparência');
    expect(labels.map((l) => l.textContent?.trim())).toEqual(['Claro', 'Escuro', 'Sistema']);
    expect(labels.every((l) => l.querySelector('svg') !== null && l.classList.contains('gef-segment'))).toBe(true);
  });

  it('marca a opção atual e escolher uma aplica o tema', () => {
    const { fixture, el, service } = render();
    const radios = () => [...el.querySelectorAll<HTMLInputElement>('[role="radiogroup"] input')];
    expect(radios().map((r) => r.checked)).toEqual([false, false, true]);

    radios()[0].click();
    fixture.detectChanges();
    expect(service.preference()).toBe('light');
    expect(radios().map((r) => r.checked)).toEqual([true, false, false]);
  });

  it('cada alternador tem o seu próprio grupo de rádios (não se anulam)', () => {
    TestBed.resetTestingModule();
    @Component({ imports: [ThemeToggle], template: `<gef-theme-toggle /><gef-theme-toggle />` })
    class Twice {}
    const fixture = TestBed.createComponent(Twice);
    fixture.detectChanges();
    const names = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input')].map((i) => i.name);
    expect(new Set(names).size).toBe(2);
  });

  it('variante ícone: botão que cicla, com rótulo dinâmico e região de aviso', () => {
    const { fixture, el, service } = render();
    const button = el.querySelector('button[data-testid="theme-toggle"]') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Tema: sistema. Alternar para claro');

    button.click();
    fixture.detectChanges();
    expect(service.preference()).toBe('light');
    expect(button.getAttribute('aria-label')).toBe('Tema: claro. Alternar para escuro');
    expect(el.querySelector('[aria-live="polite"]')?.textContent).toContain('claro');
  });
});
