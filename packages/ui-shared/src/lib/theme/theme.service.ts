import { DOCUMENT } from '@angular/common';
import { EnvironmentProviders, Injectable, computed, effect, inject, provideAppInitializer, signal } from '@angular/core';

/** Escolha da pessoa: seguir o sistema (padrão), claro ou escuro. */
export type ThemePreference = 'system' | 'light' | 'dark';
/** Tema efetivamente aplicado. */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'gefinc.ui.theme';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
export const THEME_LABELS: Readonly<Record<ThemePreference, string>> = { light: 'Claro', dark: 'Escuro', system: 'Sistema' };

/** Cor da barra do navegador por tema (a do escuro é a do manifesto). */
const META_COLOR: Readonly<Record<ResolvedTheme, string>> = { dark: '#090d16', light: '#f3f6fb' };
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Aceita só valores conhecidos: o que estiver gravado fora da lista é ignorado (vira "sistema"). */
export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

/**
 * Tema claro/escuro. A preferência (`light`, `dark` ou `system`) fica em `localStorage` (cosmética, sem dado
 * pessoal) e o tema resolvido vai para `data-theme` na raiz do documento, que troca as variáveis CSS. Em
 * "sistema" acompanha o `prefers-color-scheme` em tempo real; sem essa informação, usa o escuro. O mesmo
 * cálculo roda antes da primeira pintura, em um script do `index.html`, para não haver flash.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  private readonly media = this.matchDark();

  readonly preference = signal<ThemePreference>(this.read());
  private readonly systemDark = signal(this.media?.matches ?? true);
  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this.preference();
    return preference === 'system' ? (this.systemDark() ? 'dark' : 'light') : preference;
  });

  constructor() {
    this.media?.addEventListener?.('change', (event) => this.systemDark.set(event.matches));
    this.apply(this.resolved());
    effect(() => this.apply(this.resolved()));
  }

  set(preference: ThemePreference): void {
    const next = parseThemePreference(preference);
    this.preference.set(next);
    try {
      this.doc.defaultView?.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* armazenamento bloqueado: a escolha vale só nesta visita */
    }
  }

  /** Percorre Claro, Escuro e Sistema. */
  cycle(): void {
    const order = THEME_PREFERENCES;
    this.set(order[(order.indexOf(this.preference()) + 1) % order.length]);
  }

  private read(): ThemePreference {
    try {
      return parseThemePreference(this.doc.defaultView?.localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      return 'system';
    }
  }

  private matchDark(): MediaQueryList | null {
    try {
      return this.doc.defaultView?.matchMedia?.(DARK_QUERY) ?? null;
    } catch {
      return null;
    }
  }

  private apply(theme: ResolvedTheme): void {
    const root = this.doc.documentElement;
    root.dataset['theme'] = theme;
    this.doc.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', META_COLOR[theme]));
  }
}

/** Instancia o serviço na inicialização, para o tema valer (e acompanhar o sistema) em qualquer tela. */
export function provideTheme(): EnvironmentProviders {
  return provideAppInitializer(() => {
    inject(ThemeService);
  });
}
