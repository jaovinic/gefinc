import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GlassToggle } from './glass-toggle';
import { GLASS_STORAGE_KEY, GlassService } from './glass.service';

@Component({ imports: [GlassToggle], template: `<gef-glass-toggle />` })
class Host {}

type Listener = (event: { matches: boolean }) => void;

describe('GlassToggle', () => {
  const original = window.matchMedia;
  let notify: (matches: boolean) => void = () => undefined;

  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    setSystem(false);
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  function setSystem(matches: boolean) {
    const listeners: Listener[] = [];
    const query = { matches, addEventListener: (_: string, fn: Listener) => listeners.push(fn) };
    window.matchMedia = jest.fn().mockReturnValue(query);
    notify = (next) => {
      query.matches = next;
      listeners.forEach((fn) => fn({ matches: next }));
    };
  }

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, service: TestBed.inject(GlassService), input: el.querySelector('input') as HTMLInputElement };
  }

  it('é um interruptor "Desfoque (vidro)" com a descrição ligada ao campo', () => {
    const { el, input } = render();
    const row = el.querySelector('label') as HTMLElement;

    expect(row.classList.contains('gef-switch-row')).toBe(true);
    expect(row.textContent).toContain('Desfoque (vidro)');
    expect(input.type).toBe('checkbox');
    expect(input.getAttribute('role')).toBe('switch');
    expect(input.classList.contains('gef-switch')).toBe(true);
    const description = el.querySelector(`#${input.getAttribute('aria-describedby')}`);
    expect(description?.textContent?.trim().length).toBeGreaterThan(10);
  });

  it('começa ligado e desligar grava "flat" (e ligar grava "blur")', () => {
    const { fixture, service, input } = render();
    expect(input.checked).toBe(true);

    input.click();
    fixture.detectChanges();
    expect(service.mode()).toBe('flat');
    expect(localStorage.getItem(GLASS_STORAGE_KEY)).toBe('flat');
    expect(input.checked).toBe(false);

    input.click();
    fixture.detectChanges();
    expect(service.mode()).toBe('blur');
    expect(input.checked).toBe(true);
  });

  it('reflete a escolha gravada', () => {
    localStorage.setItem(GLASS_STORAGE_KEY, 'flat');
    expect(render().input.checked).toBe(false);
  });

  it('sem pedido do sistema não mostra o aviso', () => {
    expect(render().el.querySelector('[role="status"]')).toBeNull();
  });

  it('com o sistema pedindo menos transparência avisa que o desfoque está desligado, e some quando o pedido sai', () => {
    setSystem(true);
    const { fixture, el } = render();
    const notice = el.querySelector('[role="status"]');
    expect(notice?.textContent).toContain('menos transparência');
    expect(notice?.textContent).toContain('desligado');

    notify(false);
    fixture.detectChanges();
    expect(el.querySelector('[role="status"]')).toBeNull();
  });
});
