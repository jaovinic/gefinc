import { Component, computed, model } from '@angular/core';
import { Icon } from '../icons/icon';

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Seletor de mês ("YYYY-MM") com navegação anterior e próximo. */
@Component({
  selector: 'gef-month-picker',
  imports: [Icon],
  template: `
    <div class="flex w-full items-center justify-between gap-2 rounded-lg sm:inline-flex sm:w-auto sm:justify-start border border-gefinc-border bg-(--glass-bg) px-2 py-1">
      <button type="button" class="gef-icon-btn min-h-[44px] min-w-[44px] md:min-h-9 md:min-w-9" aria-label="Mês anterior" (click)="shift(-1)">
        <gef-icon name="chevron-left" [size]="20" />
      </button>
      <span class="min-w-0 flex-1 text-balance text-center leading-tight first-letter:uppercase sm:min-w-36 sm:flex-none text-body-base font-semibold text-gefinc-text" aria-live="polite">
        {{ label() }}
      </span>
      <button type="button" class="gef-icon-btn min-h-[44px] min-w-[44px] md:min-h-9 md:min-w-9" aria-label="Próximo mês" (click)="shift(1)">
        <gef-icon name="chevron-right" [size]="20" />
      </button>
    </div>
  `,
  host: { class: 'block w-full sm:inline-block sm:w-auto' },
})
export class MonthPicker {
  /** Mês selecionado no formato `YYYY-MM`. */
  readonly value = model.required<string>();

  protected readonly label = computed(() => {
    const match = MONTH_PATTERN.exec(this.value());
    if (!match) {
      return '';
    }
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
  });

  protected shift(delta: number): void {
    const match = MONTH_PATTERN.exec(this.value());
    if (!match) {
      return;
    }
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    this.value.set(`${date.getUTCFullYear()}-${month}`);
  }
}
