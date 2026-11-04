import { TestBed } from '@angular/core/testing';
import { THEME_CHROME, THEME_STORAGE_KEY, ThemeChrome, ThemeService, parseThemePreference } from './theme.service';

type Listener = (event: { matches: boolean }) => void;

/** matchMedia falso: `matches` e o disparo do evento `change` são controlados pelo teste. */
function fakeMatchMedia(initialDark: boolean) {
  const listeners: Listener[] = [];
  const query = {
    matches: initialDark,
    addEventListener: (_: string, fn: Listener) => listeners.push(fn),
  };
  window.matchMedia = jest.fn().mockReturnValue(query);
  return {
    change: (dark: boolean) => {
      query.matches = dark;
      listeners.forEach((fn) => fn({ matches: dark }));
    },
  };
}

describe('ThemeService', () => {
  const original = window.matchMedia;

  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.head.innerHTML = '<meta name="theme-color" content="#000000"><meta name="theme-color" content="#000000" media="(prefers-color-scheme: light)">';
  });

  afterEach(() => {
    window.matchMedia = original;
    jest.restoreAllMocks();
  });

  const metaColors = () => Array.from(document.querySelectorAll('meta[name="theme-color"]')).map((m) => m.getAttribute('content'));

  it('sem preferência gravada segue o sistema e aplica data-theme', () => {
    fakeMatchMedia(false);
    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('system');
    expect(service.resolved()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('sem matchMedia o tema é escuro', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    const service = TestBed.inject(ThemeService);

    expect(service.resolved()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('carrega a preferência gravada e ignora valores inválidos', () => {
    fakeMatchMedia(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(TestBed.inject(ThemeService).preference()).toBe('light');

    TestBed.resetTestingModule();
    localStorage.setItem(THEME_STORAGE_KEY, '<script>');
    const service = TestBed.inject(ThemeService);
    expect(service.preference()).toBe('system');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('só aceita light, dark e system', () => {
    expect(['light', 'dark', 'system', 'x', null, undefined, 1].map(parseThemePreference)).toEqual([
      'light', 'dark', 'system', 'system', 'system', 'system', 'system',
    ]);
  });

  it('set persiste, aplica o tema e atualiza as metas theme-color', async () => {
    fakeMatchMedia(true);
    const service = TestBed.inject(ThemeService);

    service.set('light');
    TestBed.tick();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(metaColors()).toEqual(['#f3f6fb', '#f3f6fb']);

    service.set('dark');
    TestBed.tick();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(metaColors()).toEqual(['#090d16', '#090d16']);
  });

  it('em "sistema" reage à mudança do sistema em tempo real', () => {
    const media = fakeMatchMedia(true);
    const service = TestBed.inject(ThemeService);
    expect(service.resolved()).toBe('dark');

    media.change(false);
    TestBed.tick();
    expect(service.resolved()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('com tema escolhido, a mudança do sistema não o altera', () => {
    const media = fakeMatchMedia(true);
    const service = TestBed.inject(ThemeService);
    service.set('dark');

    media.change(false);
    TestBed.tick();
    expect(service.resolved()).toBe('dark');
  });

  it('cycle percorre Claro, Escuro e Sistema', () => {
    fakeMatchMedia(true);
    const service = TestBed.inject(ThemeService);
    service.set('light');

    service.cycle();
    expect(service.preference()).toBe('dark');
    service.cycle();
    expect(service.preference()).toBe('system');
    service.cycle();
    expect(service.preference()).toBe('light');
  });

  it('armazenamento bloqueado não lança: a escolha vale na visita', () => {
    fakeMatchMedia(true);
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('system');
    expect(() => service.set('light')).not.toThrow();
    expect(service.preference()).toBe('light');
  });
  describe('porta do chrome do sistema (barras de status e de gestos)', () => {
    const withChrome = (sync: ThemeChrome['sync']) => TestBed.configureTestingModule({ providers: [{ provide: THEME_CHROME, useValue: { sync } }] });

    it('é avisada do tema na partida e a cada mudança de preferência', () => {
      fakeMatchMedia(true);
      const sync = jest.fn();
      withChrome(sync);
      const service = TestBed.inject(ThemeService);
      TestBed.tick();
      expect(sync).toHaveBeenLastCalledWith('dark');

      service.set('light');
      TestBed.tick();
      expect(sync).toHaveBeenLastCalledWith('light');

      service.set('dark');
      TestBed.tick();
      expect(sync).toHaveBeenLastCalledWith('dark');
    });

    it('em "sistema" acompanha a mudança do sistema em tempo real', () => {
      const media = fakeMatchMedia(true);
      const sync = jest.fn();
      withChrome(sync);
      TestBed.inject(ThemeService);
      TestBed.tick();

      media.change(false);
      TestBed.tick();
      expect(sync).toHaveBeenLastCalledWith('light');
    });

    it('falha da porta (síncrona ou assíncrona) não lança nem atrapalha o tema', async () => {
      fakeMatchMedia(true);
      withChrome(() => {
        throw new Error('plugin ausente');
      });
      const service = TestBed.inject(ThemeService);
      expect(() => service.set('light')).not.toThrow();
      TestBed.tick();
      expect(document.documentElement.dataset['theme']).toBe('light');

      TestBed.resetTestingModule();
      withChrome(() => Promise.reject(new Error('sem suporte')));
      const other = TestBed.inject(ThemeService);
      other.set('dark');
      TestBed.tick();
      await Promise.resolve();
      expect(document.documentElement.dataset['theme']).toBe('dark');
    });

    it('sem a porta (web) nada acontece', () => {
      fakeMatchMedia(true);
      expect(() => TestBed.inject(ThemeService).set('light')).not.toThrow();
    });
  });
});
