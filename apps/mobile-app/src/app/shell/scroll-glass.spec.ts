import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GlassService } from '@gefinc/ui-shared';
import { IDLE_MS, SAFETY_MS, ScrollGlass } from './scroll-glass';

@Component({ imports: [ScrollGlass], template: `<main gefScrollGlass></main>` })
class Host {}

describe('ScrollGlass (desliga o desfoque durante a rolagem)', () => {
  const root = document.documentElement;
  const original = window.matchMedia;
  const scrolling = () => root.hasAttribute('data-scrolling');

  beforeEach(() => {
    jest.useFakeTimers();
    TestBed.resetTestingModule();
    localStorage.clear();
    root.removeAttribute('data-scrolling');
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    jest.useRealTimers();
    window.matchMedia = original;
    Reflect.deleteProperty(window, 'onscrollend');
    jest.restoreAllMocks();
  });

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const main = (fixture.nativeElement as HTMLElement).querySelector('main') as HTMLElement;
    return { fixture, main, glass: TestBed.inject(GlassService) };
  }

  it('registra o ouvinte de rolagem como passivo', () => {
    const add = jest.spyOn(HTMLElement.prototype, 'addEventListener');
    render();
    const scroll = add.mock.calls.find(([type]) => type === 'scroll');
    expect(scroll?.[2]).toEqual(expect.objectContaining({ passive: true }));
  });

  it('marca a raiz ao rolar e a limpa depois de um instante parado (sem scrollend no navegador)', () => {
    const { main } = render();
    expect(scrolling()).toBe(false);

    main.dispatchEvent(new Event('scroll'));
    expect(scrolling()).toBe(true);

    jest.advanceTimersByTime(IDLE_MS - 1);
    expect(scrolling()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(scrolling()).toBe(false);
  });

  it('cada novo evento de rolagem adia o fim (inércia do dedo)', () => {
    const { main } = render();
    main.dispatchEvent(new Event('scroll'));
    jest.advanceTimersByTime(IDLE_MS - 10);
    main.dispatchEvent(new Event('scroll'));
    jest.advanceTimersByTime(IDLE_MS - 10);
    expect(scrolling()).toBe(true);
    jest.advanceTimersByTime(10);
    expect(scrolling()).toBe(false);
  });

  it('com scrollend no navegador, o fim vem do evento (parada com o dedo ainda na tela não religa o desfoque)', () => {
    (window as unknown as Record<string, unknown>)['onscrollend'] = null;
    const { main } = render();

    main.dispatchEvent(new Event('scroll'));
    jest.advanceTimersByTime(IDLE_MS * 3);
    expect(scrolling()).toBe(true);

    main.dispatchEvent(new Event('scrollend'));
    expect(scrolling()).toBe(false);
  });

  it('com scrollend, um tempo de segurança evita ficar sem desfoque se o evento não vier', () => {
    (window as unknown as Record<string, unknown>)['onscrollend'] = null;
    const { main } = render();
    main.dispatchEvent(new Event('scroll'));
    jest.advanceTimersByTime(SAFETY_MS);
    expect(scrolling()).toBe(false);
  });

  it('com o desfoque desligado (sólido) não faz nada: nem marca a raiz nem agenda tempo', () => {
    const { main, glass } = render();
    glass.set('flat');
    const timers = jest.getTimerCount();

    main.dispatchEvent(new Event('scroll'));
    expect(scrolling()).toBe(false);
    expect(jest.getTimerCount()).toBe(timers);
  });

  it('com o sistema forçando o sólido (transparência reduzida) também não faz nada', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true, addEventListener: jest.fn() });
    const { main } = render();
    const timers = jest.getTimerCount();

    main.dispatchEvent(new Event('scroll'));
    expect(scrolling()).toBe(false);
    expect(jest.getTimerCount()).toBe(timers);
  });

  it('ao destruir, remove a marca, o tempo pendente e o ouvinte', () => {
    const { fixture, main } = render();
    const timers = jest.getTimerCount();
    main.dispatchEvent(new Event('scroll'));
    expect(scrolling()).toBe(true);
    expect(jest.getTimerCount()).toBe(timers + 1);

    fixture.destroy();
    expect(scrolling()).toBe(false);
    expect(jest.getTimerCount()).toBe(timers);
    main.dispatchEvent(new Event('scroll'));
    expect(scrolling()).toBe(false);
  });
});
