import { Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import type { Account } from '@gefinc/core-models';
import { Icon } from '../icons/icon';
import { Sheet } from '../layout/sheet';
import { AccountBadge } from './account-badge';

let nextId = 0;

/**
 * Campo de escolha de conta ou cartão que mostra ícone e nome de cada opção (e, no cartão, a conta
 * bancária e o selo PF/PJ), no lugar do `<select>` nativo que não exibe ícones (FR-015). Valor do
 * formulário: o id da conta. Contas inativas só aparecem quando já estão escolhidas.
 */
@Component({
  selector: 'gef-account-picker',
  imports: [AccountBadge, Icon, Sheet],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AccountPicker), multi: true }],
  template: `
    <label class="gef-label" [attr.for]="fieldId">{{ label() }}</label>
    <button
      type="button"
      class="gef-input flex items-center justify-between gap-2 text-left"
      aria-haspopup="dialog"
      [id]="fieldId"
      [disabled]="disabled()"
      (click)="openList()"
    >
      @if (selected(); as account) {
        <gef-account-badge class="min-w-0 flex-1" [account]="account" [showHolder]="true" [showBank]="true" />
      } @else {
        <span class="text-gefinc-muted">{{ placeholder() }}</span>
      }
      <gef-icon class="shrink-0" name="chevron-down" [size]="16" />
    </button>
    <gef-sheet [heading]="label()" [open]="opened()" (closed)="opened.set(false)">
      @if (options().length === 0) {
        <p class="py-4 text-center text-body-base text-gefinc-muted">{{ emptyMessage() }}</p>
        <ng-content select="[empty]" />
      } @else {
        <ul role="listbox" [attr.aria-label]="label()" class="space-y-1">
          @for (account of options(); track account.id) {
            <li role="presentation">
              <button
                type="button"
                role="option"
                class="flex min-h-11 w-full items-center rounded-lg border border-transparent px-2 py-1 text-left hover:border-gefinc-primary"
                [class.border-gefinc-primary]="account.id === value()"
                [attr.data-account-id]="account.id"
                [attr.aria-selected]="account.id === value()"
                (click)="choose(account.id)"
              >
                <gef-account-badge [account]="account" [showHolder]="true" [showBank]="true" />
              </button>
            </li>
          }
        </ul>
      }
    </gef-sheet>
  `,
})
export class AccountPicker implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly accounts = input.required<Account[]>();
  readonly placeholder = input('Escolha…');
  readonly emptyMessage = input('Nenhuma conta disponível.');

  protected readonly fieldId = `gef-account-picker-${nextId++}`;
  protected readonly value = signal<number | null>(null);
  protected readonly disabled = signal(false);
  protected readonly opened = signal(false);

  protected readonly selected = computed(() => this.accounts().find((a) => a.id === this.value()) ?? null);
  protected readonly options = computed(() =>
    this.accounts().filter((a) => a.active || a.id === this.value()),
  );

  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: number | null): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected openList(): void {
    if (!this.disabled()) {
      this.opened.set(true);
    }
  }

  protected choose(id: number): void {
    this.value.set(id);
    this.onChange(id);
    this.onTouched();
    this.opened.set(false);
  }
}
