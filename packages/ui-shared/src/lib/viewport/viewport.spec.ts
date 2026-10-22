import { TestBed } from '@angular/core/testing';
import { Viewport } from './viewport';

type Listener = (event: { matches: boolean }) => void;

/** `matchMedia` falso: guarda o ouvinte para o teste simular a mudança de largura. */
function fakeMatchMedia(initial: boolean) {
  let listener: Listener | undefined;
  const query = {
    matches: initial,
    addEventListener: (_: string, fn: Listener) => (listener = fn),
    removeEventListener: () => undefined,
  };
  window.matchMedia = jest.fn().mockReturnValue(query) as unknown as typeof window.matchMedia;
  return { change: (matches: boolean) => listener?.({ matches }) };
}

describe('Viewport', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('é compacto abaixo de 768 px', () => {
    fakeMatchMedia(true);
    expect(TestBed.inject(Viewport).compact()).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767px)');
  });

  it('não é compacto em telas largas', () => {
    fakeMatchMedia(false);
    expect(TestBed.inject(Viewport).compact()).toBe(false);
  });

  it('acompanha a mudança de largura', () => {
    const media = fakeMatchMedia(false);
    const viewport = TestBed.inject(Viewport);
    media.change(true);
    expect(viewport.compact()).toBe(true);
    media.change(false);
    expect(viewport.compact()).toBe(false);
  });

  it('funciona sem matchMedia (ambiente de teste ou navegador antigo)', () => {
    (window as { matchMedia?: unknown }).matchMedia = undefined;
    expect(TestBed.inject(Viewport).compact()).toBe(false);
  });
});
