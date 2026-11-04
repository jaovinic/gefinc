import { Component, inject, input } from '@angular/core';
import { Icon } from '../icons/icon';
import { THEME_LABELS, THEME_PREFERENCES, type ThemePreference, ThemeService } from './theme.service';

const ICONS: Readonly<Record<ThemePreference, string>> = { light: 'sun', dark: 'moon', system: 'monitor' };
let nextId = 0;

/**
 * Alternância de tema. `segmented` mostra as três opções (Claro, Escuro, Sistema) como rádios com ícone e
 * texto; `icon` é um botão compacto que percorre as opções (para barras do topo e telas públicas). A
 * escolha nunca depende só de cor: há ícone, texto e estado marcado.
 */
@Component({
  selector: 'gef-theme-toggle',
  imports: [Icon],
  template: `
    @if (variant() === 'icon') {
      <button
        type="button"
        class="gef-icon-btn gef-theme-icon-btn"
        data-testid="theme-toggle"
        [attr.aria-label]="cycleLabel()"
        (click)="theme.cycle()"
      >
        <gef-icon [name]="icons[theme.preference()]" [size]="20" />
      </button>
      <span class="sr-only" aria-live="polite">Tema: {{ labels[theme.preference()].toLowerCase() }}</span>
    } @else {
      <div class="flex gap-2" role="radiogroup" aria-label="Aparência" data-testid="theme-toggle">
        @for (option of options; track option) {
          <label class="gef-segment" [attr.data-theme-option]="option">
            <input
              type="radio"
              [name]="group"
              [value]="option"
              [checked]="theme.preference() === option"
              (change)="theme.set(option)"
            />
            <gef-icon [name]="icons[option]" [size]="16" /><span>{{ labels[option] }}</span>
          </label>
        }
      </div>
    }
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
  readonly variant = input<'segmented' | 'icon'>('segmented');

  protected readonly options = THEME_PREFERENCES;
  protected readonly icons = ICONS;
  protected readonly labels = THEME_LABELS;
  protected readonly group = `gef-theme-${nextId++}`;

  protected cycleLabel(): string {
    const order = THEME_PREFERENCES;
    const current = this.theme.preference();
    const next = order[(order.indexOf(current) + 1) % order.length];
    return `Tema: ${THEME_LABELS[current].toLowerCase()}. Alternar para ${THEME_LABELS[next].toLowerCase()}`;
  }
}
