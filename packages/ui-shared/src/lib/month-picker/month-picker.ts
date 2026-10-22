import { Component, computed, model } from '@angular/core';

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Seletor de mês ("YYYY-MM") com navegação anterior e próximo. */
@Component({
  selector: 'gef-month-picker',
  template: `
    <div class="inline-flex items-center gap-2 rounded-lg border border-gefinc-border bg-gefinc-surface px-2 py-1">
      <button
        type="button"
        class="rounded px-2 py-1 text-gefinc-muted hover:text-gefinc-text"
        aria-label="Mês anterior"
        (click)="shift(-1)"
      >
        ‹
      </button>
      <span class="min-w-36 text-center text-body-base font-medium capitalize text-gefinc-text" aria-live="polite">
        {{ label() }}
      </span>
      <button
        type="button"
        class="rounded px-2 py-1 text-gefinc-muted hover:text-gefinc-text"
        aria-label="Próximo mês"
        (click)="shift(1)"
      >
        ›
      </button>
    </div>
  `,
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
