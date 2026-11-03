import { Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ACCOUNT_ICONS, type AccountIcon } from '@gefinc/core-models';
import { ACCOUNT_ICON_LABELS } from '../icons/icon-set';
import { Icon } from '../icons/icon';

/**
 * Escolha do ícone de uma conta ou cartão: grade de opções com nome acessível, operável por toque e
 * por teclado (setas movem a escolha). Sem escolha, o sistema usa o ícone padrão do tipo.
 */
@Component({
  selector: 'gef-icon-picker',
  host: { class: 'block' },
  imports: [Icon],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => IconPicker), multi: true }],
  template: `
    <div class="flex flex-wrap gap-2" role="radiogroup" [attr.aria-label]="label()">
      @for (icon of icons; track icon; let i = $index) {
        <button
          type="button"
          role="radio"
          class="gef-icon-option"
          [attr.data-icon]="icon"
          [attr.aria-checked]="value() === icon"
          [attr.aria-label]="labels[icon]"
          [attr.title]="labels[icon]"
          [attr.tabindex]="tabIndexFor(i)"
          [disabled]="disabled()"
          (click)="choose(icon)"
          (keydown)="onKeydown($event, i)"
        >
          <gef-icon [name]="icon" [size]="22" />
        </button>
      }
    </div>
    @if (value() && !disabled()) {
      <button type="button" class="gef-btn-sm mt-2" (click)="choose(null)">Usar o ícone padrão</button>
    }
  `,
})
export class IconPicker implements ControlValueAccessor {
  readonly label = input('Ícone');

  protected readonly icons = ACCOUNT_ICONS;
  protected readonly labels = ACCOUNT_ICON_LABELS;
  protected readonly value = signal<AccountIcon | null>(null);
  protected readonly disabled = signal(false);

  private onChange: (value: AccountIcon | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: AccountIcon | null): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: AccountIcon | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  /** Só uma opção entra na ordem de Tab: a marcada ou, sem escolha, a primeira. */
  protected tabIndexFor(index: number): number {
    const current = this.value();
    const selected = current ? this.icons.indexOf(current) : -1;
    return (selected === -1 ? index === 0 : index === selected) ? 0 : -1;
  }

  protected choose(icon: AccountIcon | null): void {
    if (this.disabled()) {
      return;
    }
    this.value.set(icon);
    this.onChange(icon);
    this.onTouched();
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const next = (index + step + this.icons.length) % this.icons.length;
    this.choose(this.icons[next]);
    const group = (event.currentTarget as HTMLElement).parentElement;
    queueMicrotask(() => group?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus());
  }
}
