import { DOCUMENT } from '@angular/common';
import { EnvironmentProviders, Injectable, InjectionToken, computed, effect, inject, provideAppInitializer, signal } from '@angular/core';

/** `blur`: vidro com desfoque real do fundo (padrão). `flat`: superfícies sólidas, sem desfoque. */
export type GlassMode = 'blur' | 'flat';

export const GLASS_STORAGE_KEY = 'gefinc.ui.glass';
export const GLASS_MODES: readonly GlassMode[] = ['blur', 'flat'];

/**
 * Padrão quando não há escolha gravada. O app pode sobrescrever (ex.: o móvel, se a medição em aparelho pedir).
 * O script do `index.html` repete o padrão `blur` para o primeiro quadro; mudar um exige mudar o outro.
 */
export const GLASS_DEFAULT = new InjectionToken<GlassMode>('GLASS_DEFAULT', { providedIn: 'root', factory: () => 'blur' });

/** Quando o sistema pede menos transparência ou mais contraste, o CSS já desliga o desfoque por conta própria. */
const FORCED_FLAT_QUERY = '(prefers-reduced-transparency: reduce), (prefers-contrast: more)';

/** Aceita só valores conhecidos: o que estiver gravado fora da lista é ignorado (vira o padrão). */
export function parseGlassMode(value: unknown, fallback: GlassMode = 'blur'): GlassMode {
  return value === 'blur' || value === 'flat' ? value : fallback;
}

/**
 * Desfoque do vidro (Liquid Glass). A escolha (`blur` ou `flat`) fica em `localStorage` (cosmética, sem dado
 * pessoal) e vai para `data-glass` na raiz do documento, que troca as variáveis CSS (`--glass-filter`). O mesmo
 * cálculo roda antes da primeira pintura, em um script do `index.html`, para não haver flash. Mesmo com `blur`,
 * o sistema pode forçar o sólido (transparência reduzida, contraste alto, sem suporte): `forcedFlat` revela isso.
 */
@Injectable({ providedIn: 'root' })
export class GlassService {
  private readonly doc = inject(DOCUMENT);
  private readonly fallback = inject(GLASS_DEFAULT);
  private readonly media = this.matchForced();

  readonly mode = signal<GlassMode>(this.read());
  /** A escolha é desfocar (pode ainda ser sobreposta pelo sistema; ver `active`). */
  readonly enabled = computed(() => this.mode() === 'blur');
  private readonly systemForced = signal(this.computeForced());
  /** O sistema (ou o navegador) impede o desfoque, seja qual for a escolha. */
  readonly forcedFlat = this.systemForced.asReadonly();
  /** O desfoque está de fato aparecendo: escolhido e não impedido pelo sistema. */
  readonly active = computed(() => this.enabled() && !this.forcedFlat());

  constructor() {
    this.media?.addEventListener?.('change', () => this.systemForced.set(this.computeForced()));
    this.apply(this.mode());
    effect(() => this.apply(this.mode()));
  }

  set(mode: GlassMode): void {
    const next = parseGlassMode(mode, this.fallback);
    this.mode.set(next);
    try {
      this.doc.defaultView?.localStorage.setItem(GLASS_STORAGE_KEY, next);
    } catch {
      /* armazenamento bloqueado: a escolha vale só nesta visita */
    }
  }

  toggle(): void {
    this.set(this.mode() === 'blur' ? 'flat' : 'blur');
  }

  private read(): GlassMode {
    try {
      return parseGlassMode(this.doc.defaultView?.localStorage.getItem(GLASS_STORAGE_KEY), this.fallback);
    } catch {
      return this.fallback;
    }
  }

  private matchForced(): MediaQueryList | null {
    try {
      return this.doc.defaultView?.matchMedia?.(FORCED_FLAT_QUERY) ?? null;
    } catch {
      return null;
    }
  }

  private computeForced(): boolean {
    return (this.media?.matches ?? false) || !this.supportsBackdrop();
  }

  private supportsBackdrop(): boolean {
    try {
      const css = (this.doc.defaultView as (Window & { CSS?: { supports?: (property: string, value: string) => boolean } }) | null)?.CSS;
      if (!css?.supports) {
        return true;
      }
      return css.supports('backdrop-filter', 'blur(1px)') || css.supports('-webkit-backdrop-filter', 'blur(1px)');
    } catch {
      return true;
    }
  }

  private apply(mode: GlassMode): void {
    this.doc.documentElement.dataset['glass'] = mode;
  }
}

/** Instancia o serviço na inicialização, para a escolha valer em qualquer tela. */
export function provideGlass(): EnvironmentProviders {
  return provideAppInitializer(() => {
    inject(GlassService);
  });
}
