import { Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Icon } from '../icons/icon';

export interface SwatchColor {
  /** `#RRGGBB` em maiúsculas (o servidor aceita `^#[0-9A-Fa-f]{6}$`). */
  hex: string;
  name: string;
}

/**
 * Paleta de cores de categoria. Reúne todas as cores padrão (`packages/core-models/fixtures/default-categories.json`,
 * conferidas por teste) e algumas a mais; cada cor tem nome em português para o leitor de tela.
 */
export const CATEGORY_COLORS: readonly SwatchColor[] = [
  { hex: '#F97316', name: 'Laranja' },
  { hex: '#F59E0B', name: 'Âmbar' },
  { hex: '#EAB308', name: 'Amarelo' },
  { hex: '#84CC16', name: 'Lima' },
  { hex: '#16A34A', name: 'Verde' },
  { hex: '#00E599', name: 'Verde-menta' },
  { hex: '#14B8A6', name: 'Turquesa' },
  { hex: '#00B4D8', name: 'Ciano' },
  { hex: '#3B82F6', name: 'Azul' },
  { hex: '#6366F1', name: 'Índigo' },
  { hex: '#8B5CF6', name: 'Violeta' },
  { hex: '#A855F7', name: 'Roxo' },
  { hex: '#EC4899', name: 'Rosa' },
  { hex: '#EF4444', name: 'Vermelho' },
  { hex: '#B45309', name: 'Marrom' },
  { hex: '#94A3B8', name: 'Cinza' },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

const MARK_DARK = '#090D16';
const MARK_LIGHT = '#FFFFFF';

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Cor da marca de "selecionado" sobre a cor: a de maior contraste entre o texto escuro do tema e o branco. */
function markColor(hex: string): string {
  const background = relativeLuminance(hex) + 0.05;
  const dark = background / (relativeLuminance(MARK_DARK) + 0.05);
  const light = (relativeLuminance(MARK_LIGHT) + 0.05) / background;
  return dark >= light ? MARK_DARK : MARK_LIGHT;
}

/**
 * Escolha da cor por paleta (grupo de opções com nome acessível), no lugar do seletor de cor do sistema. Setas movem a
 * escolha. Se o valor recebido não é da paleta (cor antiga, escolhida em outro lugar), ele aparece como "Cor atual" e
 * continua selecionável: nenhum dado se perde. Valor do formulário: `#RRGGBB`.
 */
@Component({
  selector: 'gef-color-swatch',
  host: { class: 'block' },
  imports: [Icon],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ColorSwatch), multi: true }],
  template: `
    <div class="flex flex-wrap gap-2" role="radiogroup" [attr.aria-label]="label()">
      @for (color of colors(); track color.hex; let i = $index) {
        <button
          type="button"
          role="radio"
          class="gef-swatch"
          [attr.data-color]="color.hex"
          [attr.aria-checked]="color.hex === value()"
          [attr.aria-label]="color.name + ' (' + color.hex + ')'"
          [attr.title]="color.name"
          [attr.tabindex]="tabIndexFor(i)"
          [style.backgroundColor]="color.hex"
          [style.color]="markFor(color.hex)"
          [disabled]="disabled()"
          (click)="choose(color.hex)"
          (keydown)="onKeydown($event, i)"
        >
          @if (color.hex === value()) {
            <gef-icon name="check" [size]="20" />
          }
        </button>
      }
    </div>
  `,
})
export class ColorSwatch implements ControlValueAccessor {
  readonly label = input('Cor');

  protected readonly value = signal<string | null>(null);
  protected readonly disabled = signal(false);
  /** Cor recebida que não está na paleta; fica na lista para poder voltar a ela. */
  private readonly current = signal<string | null>(null);

  protected readonly colors = computed<SwatchColor[]>(() => {
    const current = this.current();
    return current ? [{ hex: current, name: 'Cor atual' }, ...CATEGORY_COLORS] : [...CATEGORY_COLORS];
  });

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null | undefined): void {
    const hex = value && HEX.test(value) ? value.toUpperCase() : null;
    this.value.set(hex);
    this.current.set(hex && !CATEGORY_COLORS.some((c) => c.hex === hex) ? hex : null);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected markFor(hex: string): string {
    return markColor(hex);
  }

  /** Só uma opção entra na ordem de Tab: a marcada ou, sem escolha, a primeira. */
  protected tabIndexFor(index: number): number {
    const selected = this.colors().findIndex((c) => c.hex === this.value());
    return (selected === -1 ? index === 0 : index === selected) ? 0 : -1;
  }

  protected choose(hex: string): void {
    if (this.disabled()) {
      return;
    }
    this.value.set(hex);
    this.onChange(hex);
    this.onTouched();
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const colors = this.colors();
    const next = (index + step + colors.length) % colors.length;
    this.choose(colors[next].hex);
    const group = (event.currentTarget as HTMLElement).parentElement;
    queueMicrotask(() => group?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus());
  }
}
