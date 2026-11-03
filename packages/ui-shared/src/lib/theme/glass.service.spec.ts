import { TestBed } from '@angular/core/testing';
import { GLASS_DEFAULT, GLASS_STORAGE_KEY, GlassService, parseGlassMode } from './glass.service';

type Listener = (event: { matches: boolean }) => void;

/** matchMedia falso: `matches` e o disparo do evento `change` são controlados pelo teste. */
function fakeMatchMedia(initial: boolean) {
  const listeners: Listener[] = [];
  const query = { matches: initial, addEventListener: (_: string, fn: Listener) => listeners.push(fn) };
  window.matchMedia = jest.fn().mockReturnValue(query);
  return {
    change: (matches: boolean) => {
      query.matches = matches;
      listeners.forEach((fn) => fn({ matches }));
    },
  };
}

describe('GlassService', () => {
  const original = window.matchMedia;

  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    document.documentElement.removeAttribute('data-glass');
    fakeMatchMedia(false);
  });

  afterEach(() => {
    window.matchMedia = original;
    jest.restoreAllMocks();
  });

  it('sem escolha gravada o desfoque fica ligado e data-glass reflete isso', () => {
    const service = TestBed.inject(GlassService);

    expect(service.mode()).toBe('blur');
    expect(service.enabled()).toBe(true);
    expect(document.documentElement.dataset['glass']).toBe('blur');
  });

  it('só aceita blur e flat: qualquer outro valor vira o padrão', () => {
    expect(['blur', 'flat', 'x', '', null, undefined, 1, {}].map((v) => parseGlassMode(v))).toEqual([
      'blur', 'flat', 'blur', 'blur', 'blur', 'blur', 'blur', 'blur',
    ]);
    expect(parseGlassMode('x', 'flat')).toBe('flat');
  });

  it('carrega a escolha gravada e ignora valores inválidos', () => {
    localStorage.setItem(GLASS_STORAGE_KEY, 'flat');
    expect(TestBed.inject(GlassService).mode()).toBe('flat');
    expect(document.documentElement.dataset['glass']).toBe('flat');

    TestBed.resetTestingModule();
    localStorage.setItem(GLASS_STORAGE_KEY, '"><script>');
    const service = TestBed.inject(GlassService);
    expect(service.mode()).toBe('blur');
    expect(document.documentElement.dataset['glass']).toBe('blur');
  });

  it('o padrão pode ser trocado pelo app (token GLASS_DEFAULT) e só vale sem escolha gravada', () => {
    TestBed.configureTestingModule({ providers: [{ provide: GLASS_DEFAULT, useValue: 'flat' }] });
    expect(TestBed.inject(GlassService).mode()).toBe('flat');

    TestBed.resetTestingModule();
    localStorage.setItem(GLASS_STORAGE_KEY, 'blur');
    TestBed.configureTestingModule({ providers: [{ provide: GLASS_DEFAULT, useValue: 'flat' }] });
    expect(TestBed.inject(GlassService).mode()).toBe('blur');
  });

  it('set persiste e aplica data-glass', () => {
    const service = TestBed.inject(GlassService);

    service.set('flat');
    TestBed.tick();
    expect(localStorage.getItem(GLASS_STORAGE_KEY)).toBe('flat');
    expect(document.documentElement.dataset['glass']).toBe('flat');
    expect(service.enabled()).toBe(false);

    service.set('blur');
    TestBed.tick();
    expect(localStorage.getItem(GLASS_STORAGE_KEY)).toBe('blur');
    expect(document.documentElement.dataset['glass']).toBe('blur');
  });

  it('set com valor inválido cai no padrão (nunca grava lixo)', () => {
    const service = TestBed.inject(GlassService);
    service.set('flat');
    service.set('x' as never);
    expect(service.mode()).toBe('blur');
    expect(localStorage.getItem(GLASS_STORAGE_KEY)).toBe('blur');
  });

  it('toggle alterna entre desfoque e sólido', () => {
    const service = TestBed.inject(GlassService);
    service.toggle();
    expect(service.mode()).toBe('flat');
    service.toggle();
    expect(service.mode()).toBe('blur');
  });

  it('armazenamento bloqueado não lança: a escolha vale na visita', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const service = TestBed.inject(GlassService);

    expect(service.mode()).toBe('blur');
    expect(() => service.set('flat')).not.toThrow();
    expect(service.mode()).toBe('flat');
  });

  describe('sistema pedindo menos transparência ou mais contraste', () => {
    it('força o desfoque desligado sem apagar a escolha, e acompanha a mudança em tempo real', () => {
      const media = fakeMatchMedia(true);
      const service = TestBed.inject(GlassService);
      expect(service.mode()).toBe('blur');
      expect(service.forcedFlat()).toBe(true);
      expect(service.active()).toBe(false);

      media.change(false);
      expect(service.forcedFlat()).toBe(false);
      expect(service.active()).toBe(true);
    });

    it('com a escolha "sólido" o desfoque nunca fica ativo', () => {
      const service = TestBed.inject(GlassService);
      service.set('flat');
      expect(service.active()).toBe(false);
    });

    it('sem matchMedia (ou se ele lançar) o desfoque não é forçado', () => {
      window.matchMedia = undefined as unknown as typeof window.matchMedia;
      expect(TestBed.inject(GlassService).forcedFlat()).toBe(false);

      TestBed.resetTestingModule();
      window.matchMedia = jest.fn().mockImplementation(() => {
        throw new Error('sem suporte');
      });
      expect(TestBed.inject(GlassService).forcedFlat()).toBe(false);
    });

    it('sem suporte a backdrop-filter no navegador o desfoque fica forçado desligado', () => {
      const supports = jest.fn().mockReturnValue(false);
      Object.defineProperty(window, 'CSS', { configurable: true, value: { supports } });
      try {
        expect(TestBed.inject(GlassService).forcedFlat()).toBe(true);
      } finally {
        Reflect.deleteProperty(window, 'CSS');
      }
    });
  });
});
