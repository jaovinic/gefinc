import { Component, ElementRef, afterNextRender, computed, forwardRef, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { formatBRL, fromCents, isValidMoney, toCents } from '@gefinc/utils';

const MAX_DIGITS = 15;

/**
 * Campo de valor em reais: o usuário digita só algarismos e o campo preenche os centavos
 * (digitar 1234 vira "12,34"). O valor do formulário é a string decimal do contrato ("12.34"),
 * ou `null` enquanto estiver vazio. Aceita só valores não negativos (sem sinal).
 */
@Component({
  selector: 'gef-money-input',
  host: { class: 'block' },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MoneyInput), multi: true },
  ],
  template: `
    <label class="block">
      @if (label()) {
        <span class="mb-1 block text-caption text-gefinc-muted">{{ label() }}</span>
      }
      <span class="gef-money-field" [attr.data-size]="size()">
        <span
          class="flex items-center text-gefinc-muted"
          [class]="hero() ? 'text-title-lg font-bold' : 'text-body-base'"
          aria-hidden="true"
          >R$</span
        >
        <input
          #field
          class="financial-value w-full bg-transparent py-2 outline-none"
          [class]="inputClass()"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          [value]="display()"
          [disabled]="disabled()"
          [attr.aria-label]="label() || 'Valor em reais'"
          [attr.data-tone]="tone()"
          (input)="onInput(field)"
          (blur)="touched()"
        />
      </span>
    </label>
  `,
})
export class MoneyInput implements ControlValueAccessor {
  readonly label = input('');
  /** Foca o campo ao abrir a tela, para o teclado numérico aparecer sem um toque extra. */
  readonly autofocus = input(false);
  /** `hero`: valor em destaque (tela de lançamento rápido); `default`: campo de formulário comum. */
  readonly size = input<'default' | 'hero'>('default');
  /** Cor só do texto do valor (receita verde, despesa vermelha); o foco é sempre neutro. */
  readonly tone = input<'neutral' | 'income' | 'expense'>('neutral');

  protected readonly hero = computed(() => this.size() === 'hero');
  protected readonly inputClass = computed(() => {
    const color = { neutral: 'text-gefinc-text', income: 'text-gefinc-primary', expense: 'text-gefinc-danger' }[this.tone()];
    return this.hero()
      ? `px-2 text-center text-display-1 font-extrabold ${color}`
      : `px-2 text-right text-body-base ${color}`;
  });

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  protected readonly cents = signal<bigint | null>(null);
  protected readonly disabled = signal(false);
  protected readonly display = computed(() => {
    const cents = this.cents();
    return cents === null ? '' : formatBRL(fromCents(cents)).replace('R$ ', '');
  });

  /** Foca o campo (ex.: depois de trocar a natureza do lançamento, para o teclado numérico continuar aberto). */
  focus(options?: FocusOptions): void {
    this.field()?.nativeElement.focus(options);
  }

  constructor() {
    afterNextRender(() => {
      if (this.autofocus()) {
        this.field()?.nativeElement.focus();
      }
    });
  }

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
