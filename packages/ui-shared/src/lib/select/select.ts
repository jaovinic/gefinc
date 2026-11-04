import { Component, ElementRef, OnDestroy, computed, forwardRef, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Icon } from '../icons/icon';
import { Sheet } from '../layout/sheet';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

let nextId = 0;

/** Pausa entre teclas depois da qual a busca por digitação recomeça. */
const TYPEAHEAD_RESET_MS = 700;

/** Sem acento e sem maiúsculas, para a busca por digitação ("sau" encontra "Saúde"). */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Lista de escolha própria, no lugar do `<select>` (que no Android abre a lista do sistema). O gatilho é um
 * botão cujo nome acessível é o rótulo seguido do valor atual (`aria-labelledby`, que os leitores de tela leem
 * sempre, ao contrário da descrição) e que anuncia um diálogo (`aria-haspopup="dialog"`, o painel é modal);
 * a lista abre num `gef-sheet` (foco preso, Escape, toque no fundo, botão Voltar do
 * Android e devolução do foco) com `listbox`/`option`, foco real entre as opções (roving tabindex), setas,
 * Home, End e busca por digitação. Valor do formulário: o `value` da opção (texto ou número, como informado).
 */
@Component({
  selector: 'gef-select',
  host: { class: 'block' },
  imports: [Icon, Sheet],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Select), multi: true }],
  template: `
    @if (label()) {
      <label class="gef-label" [id]="labelId" [attr.for]="fieldId">{{ label() }}</label>
    } @else {
      <span class="sr-only" [id]="labelId">{{ ariaLabel() }}</span>
    }
    <button
      type="button"
      class="gef-input flex items-center justify-between gap-2 text-left"
      aria-haspopup="dialog"
      [id]="fieldId"
      [attr.aria-expanded]="opened()"
      [attr.aria-labelledby]="labelId + ' ' + valueId"
      [disabled]="disabled()"
      (click)="openList()"
      (keydown)="onTriggerKeydown($event)"
    >
      <span [id]="valueId" class="min-w-0 flex-1 truncate" [class.text-gefinc-muted]="!selected()">{{ selected()?.label ?? placeholder() }}</span>
      <gef-icon class="shrink-0" name="chevron-down" [size]="16" />
    </button>
    <gef-sheet [heading]="heading()" [open]="opened()" [initialFocus]="initialFocus" (closed)="close()">
      @if (opened()) {
        @if (options().length === 0) {
          <p class="py-4 text-center text-body-base text-gefinc-muted">{{ emptyMessage() }}</p>
        } @else {
          <ul #list role="listbox" [attr.aria-label]="heading()" class="max-h-[60dvh] space-y-1 overflow-y-auto overscroll-contain p-1.5">
            @for (option of options(); track $index; let i = $index) {
              <li
                role="option"
                class="gef-option"
                [attr.aria-selected]="option.value === value()"
                [attr.aria-disabled]="option.disabled ? 'true' : null"
                [attr.tabindex]="i === active() ? 0 : -1"
                (click)="choose(option)"
                (keydown)="onListKeydown($event)"
              >
                <span class="min-w-0 flex-1">{{ option.label }}</span>
                @if (option.value === value()) {
                  <gef-icon class="shrink-0" name="check" [size]="18" />
                }
              </li>
            }
          </ul>
        }
      }
    </gef-sheet>
  `,
})
export class Select implements ControlValueAccessor, OnDestroy {
  /** Rótulo visível acima do campo; também dá nome ao painel. */
  readonly label = input('');
  /** Nome acessível quando não há rótulo visível (ex.: filtros em linha). */
  readonly ariaLabel = input('');
  readonly options = input.required<SelectOption[]>();
  readonly placeholder = input('Escolha…');
  readonly emptyMessage = input('Nenhuma opção disponível.');

  protected readonly fieldId = `gef-select-${nextId++}`;
  protected readonly labelId = `${this.fieldId}-label`;
  protected readonly valueId = `${this.fieldId}-value`;
  protected readonly initialFocus = '[role="option"][tabindex="0"]';
  protected readonly value = signal<string | number | null>(null);
  protected readonly disabled = signal(false);
  protected readonly opened = signal(false);
  /** Índice da opção com foco (roving tabindex): só ela entra na ordem de Tab. */
  protected readonly active = signal(-1);

  protected readonly heading = computed(() => this.label() || this.ariaLabel());
  protected readonly selected = computed(() => this.options().find((o) => o.value === this.value()) ?? null);

  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private buffer = '';
  private bufferTimer: ReturnType<typeof setTimeout> | null = null;

  private onChange: (value: string | number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  ngOnDestroy(): void {
    this.resetBuffer();
  }

  writeValue(value: string | number | null | undefined): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: string | number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected openList(): void {
    if (this.disabled()) {
      return;
    }
    const options = this.options();
    const current = options.findIndex((o) => o.value === this.value() && !o.disabled);
    this.active.set(current !== -1 ? current : options.findIndex((o) => !o.disabled));
    this.resetBuffer();
    this.opened.set(true);
  }

  protected close(): void {
    this.opened.set(false);
    this.onTouched();
  }

  protected choose(option: SelectOption): void {
    if (option.disabled) {
      return;
    }
    this.value.set(option.value);
    this.onChange(option.value);
    this.close();
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.openList();
    }
  }

  protected onListKeydown(event: KeyboardEvent): void {
    const options = this.options();
    const current = this.indexOf(event);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.move(this.step(current, 1));
        return;
      case 'ArrowUp':
        event.preventDefault();
        this.move(this.step(current, -1));
        return;
      case 'Home':
        event.preventDefault();
        this.move(options.findIndex((o) => !o.disabled));
        return;
      case 'End':
        event.preventDefault();
        this.move(this.step(options.length, -1));
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!event.repeat && options[current]) {
          this.choose(options[current]);
        }
        return;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          this.typeahead(event.key, current);
        }
    }
  }

  /** Opção que recebeu a tecla (o foco real); sem ela, a ativa. */
  private indexOf(event: Event): number {
    const items = Array.from(this.list()?.nativeElement.querySelectorAll('[role="option"]') ?? []);
    const index = items.indexOf((event.target as Element).closest('[role="option"]') as Element);
    return index === -1 ? this.active() : index;
  }

  /** Próxima opção habilitada na direção dada; nas pontas, fica onde está. */
  private step(from: number, direction: 1 | -1): number {
    const options = this.options();
    for (let i = from + direction; i >= 0 && i < options.length; i += direction) {
      if (!options[i].disabled) {
        return i;
      }
    }
    return from;
  }

  private move(index: number): void {
    if (index < 0) {
      return;
    }
    this.active.set(index);
    this.list()?.nativeElement.querySelectorAll<HTMLElement>('[role="option"]')[index]?.focus();
  }

  /** Busca por digitação: letras seguidas formam o prefixo; uma pausa recomeça. */
  private typeahead(char: string, current: number): void {
    this.buffer += normalize(char);
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
    }
    this.bufferTimer = setTimeout(() => this.resetBuffer(), TYPEAHEAD_RESET_MS);
    const options = this.options();
    // Uma letra só repetida percorre as opções; com várias, a busca parte da opção atual.
    const start = this.buffer.length === 1 ? current + 1 : Math.max(current, 0);
    for (let offset = 0; offset < options.length; offset++) {
      const index = (start + offset) % options.length;
      if (!options[index].disabled && normalize(options[index].label).startsWith(this.buffer)) {
        this.move(index);
        return;
      }
    }
  }

  private resetBuffer(): void {
    this.buffer = '';
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.bufferTimer = null;
    }
  }
}
