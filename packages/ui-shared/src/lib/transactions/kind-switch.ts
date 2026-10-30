import { Component, forwardRef, output, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import type { CategoryType } from '@gefinc/core-models';
import { Icon } from '../icons/icon';

/**
 * Escolha entre despesa e receita (rádios nativos com aparência de botões). Valor do formulário: o
 * `CategoryType`. Os ids `kind-EXPENSE` e `kind-INCOME` são fixos, por isso só deve haver um por página.
 * O tom vem da natureza (despesa vermelha, receita verde) e o ícone reforça além da cor. `picked` diz
 * se a escolha veio de toque/clique (`pointer`) ou de teclado e tecnologia assistiva (`keyboard`), para
 * quem usa o seletor poder devolver o foco só quando foi um toque.
 */
@Component({
  selector: 'gef-kind-switch',
  imports: [Icon],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => KindSwitch), multi: true }],
  template: `
    <div class="flex gap-2" data-field="kind" role="radiogroup" aria-label="Natureza do lançamento">
      <label class="gef-segment" data-kind="EXPENSE">
        <input
          type="radio"
          name="gef-kind"
          id="kind-EXPENSE"
          value="EXPENSE"
          [checked]="value() === 'EXPENSE'"
          [disabled]="disabled()"
          (change)="choose('EXPENSE')"
          (blur)="onTouched()"
        />
        <gef-icon name="arrow-down" [size]="16" /><span>Despesa</span>
      </label>
      <label class="gef-segment" data-kind="INCOME">
        <input
          type="radio"
          name="gef-kind"
          id="kind-INCOME"
          value="INCOME"
          [checked]="value() === 'INCOME'"
          [disabled]="disabled()"
          (change)="choose('INCOME')"
          (blur)="onTouched()"
        />
        <gef-icon name="arrow-up" [size]="16" /><span>Receita</span>
      </label>
    </div>
  `,
  host: { '(pointerdown)': 'byPointer = true', '(keydown)': 'byPointer = false' },
})
export class KindSwitch implements ControlValueAccessor {
  protected readonly value = signal<CategoryType>('EXPENSE');
  protected readonly disabled = signal(false);

  /** Entrada que precede a mudança: `pointerdown` marca toque; qualquer tecla desmarca (setas percorrem as opções). */
  protected byPointer = false;

  /** Emitida depois de escolher uma natureza, com a origem da escolha. */
  readonly picked = output<'pointer' | 'keyboard'>();

  private onChange: (value: CategoryType) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected choose(kind: CategoryType): void {
    this.value.set(kind);
    this.onChange(kind);
    this.onTouched();
    const source = this.byPointer ? 'pointer' : 'keyboard';
    this.byPointer = false;
    this.picked.emit(source);
  }

  writeValue(value: CategoryType | null): void {
    this.value.set(value ?? 'EXPENSE');
  }

  registerOnChange(fn: (value: CategoryType) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}
