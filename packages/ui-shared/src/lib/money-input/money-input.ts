import { Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { formatBRL, fromCents, isValidMoney, toCents } from '@gefinc/utils';

const MAX_DIGITS = 15;

/**
 * Campo de valor em reais: o usuário digita só algarismos e o campo preenche os centavos
 * (digitar 1234 vira "12,34"). O valor do formulário é a string decimal do contrato ("12.34"),
 * ou `null` enquanto estiver vazio.
 */
@Component({
  selector: 'gef-money-input',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MoneyInput), multi: true },
  ],
  template: `
    <label class="block">
      @if (label()) {
        <span class="mb-1 block text-caption text-gefinc-muted">{{ label() }}</span>
      }
      <span
        class="flex items-center rounded-lg border border-gefinc-border bg-gefinc-surface px-3 focus-within:border-gefinc-primary"
      >
        <span class="text-body-base text-gefinc-muted" aria-hidden="true">R$</span>
        <input
          #field
          class="financial-value w-full bg-transparent px-2 py-2 text-right text-body-base text-gefinc-text outline-none"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          [value]="display()"
          [disabled]="disabled()"
          [attr.aria-label]="label() || 'Valor em reais'"
          (input)="onInput(field)"
          (blur)="touched()"
        />
      </span>
    </label>
  `,
})
export class MoneyInput implements ControlValueAccessor {
  readonly label = input('');

  protected readonly cents = signal<bigint | null>(null);
  protected readonly disabled = signal(false);
  protected readonly display = computed(() => {
    const cents = this.cents();
    return cents === null ? '' : formatBRL(fromCents(cents)).replace('R$ ', '');
  });

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  protected onInput(field: HTMLInputElement): void {
    const digits = field.value.replace(/\D/g, '').slice(0, MAX_DIGITS);
    if (digits === '') {
      this.cents.set(null);
      this.onChange(null);
    } else {
      const cents = BigInt(digits);
      this.cents.set(cents);
      this.onChange(fromCents(cents));
    }
    field.value = this.display();
  }

  protected touched(): void {
    this.onTouched();
  }

  writeValue(value: string | null): void {
    this.cents.set(typeof value === 'string' && isValidMoney(value) ? toCents(value) : null);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
