import { Component, ElementRef, Injector, afterNextRender, computed, forwardRef, inject, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';
import { brToIso, isoToBR, todayIso } from '@gefinc/utils';
import { Icon } from '../icons/icon';
import { Sheet } from '../layout/sheet';
import { addDays, addMonths, monthWeeks, parseIso, weekdayOf } from './calendar';

let nextId = 0;

const WEEKDAYS: { short: string; long: string }[] = [
  { short: 'dom', long: 'domingo' },
  { short: 'seg', long: 'segunda-feira' },
  { short: 'ter', long: 'terça-feira' },
  { short: 'qua', long: 'quarta-feira' },
  { short: 'qui', long: 'quinta-feira' },
  { short: 'sex', long: 'sexta-feira' },
  { short: 'sáb', long: 'sábado' },
];

const MONTH_FORMAT = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_FORMAT = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

type Status = 'empty' | 'incomplete' | 'invalid' | 'out' | 'ok';

/** Dígitos (no máximo 8) em "dd/mm/aaaa", com a barra só quando já existe o dígito seguinte. */
function mask(digits: string): string {
  let out = digits.slice(0, 2);
  if (digits.length > 2) {
    out += `/${digits.slice(2, 4)}`;
  }
  if (digits.length > 4) {
    out += `/${digits.slice(4, 8)}`;
  }
  return out;
}

/**
 * Data colada por inteiro, em ISO ("2026-11-05", com ou sem hora) ou com dia/mês de um dígito ("5/11/2026",
 * "05.11.2026"), já em dd/mm/aaaa. Qualquer outro texto devolve `null` e segue pela máscara dos dígitos.
 */
function pastedDate(text: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(text.trim());
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
  return br ? `${br[1].padStart(2, '0')}/${br[2].padStart(2, '0')}/${br[3]}` : null;
}

/**
 * Campo de data próprio, sem o seletor do sistema: texto numérico com máscara dd/mm/aaaa (valida data real,
 * inclusive ano bissexto) e um botão que abre um calendário num `gef-sheet` (foco preso, Escape, toque no fundo e
 * botão Voltar do Android). Valor do formulário: data ISO `AAAA-MM-DD`; enquanto o texto está incompleto,
 * inválido ou fora de `min`/`max`, o valor é `''` e o controle fica com o erro `date`. `min` e `max` são props do
 * componente (atributos HTML no campo anexariam validadores do Angular).
 */
@Component({
  selector: 'gef-date-field',
  host: { class: 'block' },
  imports: [Icon, Sheet],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateField), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => DateField), multi: true },
  ],
  template: `
    <label class="gef-label" [attr.for]="fieldInputId()">{{ label() }}</label>
    <div class="flex items-stretch gap-2">
      <input
        type="text"
        inputmode="numeric"
        autocomplete="off"
        placeholder="dd/mm/aaaa"
        maxlength="10"
        class="gef-input min-w-0 flex-1"
        [id]="fieldInputId()"
        [value]="text()"
        [disabled]="disabled()"
        [attr.aria-invalid]="showError() ? 'true' : null"
        [attr.aria-describedby]="describedByIds()"
        (input)="onInput($event)"
        (blur)="onBlur()"
      />
      <button
        type="button"
        class="gef-icon-btn shrink-0 border border-gefinc-border"
        aria-label="Abrir calendário"
        aria-haspopup="dialog"
        [attr.aria-expanded]="opened()"
        [disabled]="disabled()"
        (click)="openCalendar()"
      >
        <gef-icon name="calendar" [size]="20" />
      </button>
    </div>
    @if (showError()) {
      <p class="gef-field-error" [id]="errorId">{{ errorMessage() }}</p>
    }
    <gef-sheet heading="Escolha a data" [open]="opened()" [initialFocus]="initialFocus" (closed)="close()">
      @if (opened()) {
        <div class="mb-2 flex items-center justify-between gap-2">
          <button type="button" class="gef-icon-btn min-h-[44px] min-w-[44px]" aria-label="Mês anterior" (click)="shiftMonth(-1)">
            <gef-icon name="chevron-left" [size]="20" />
          </button>
          <span class="min-w-0 flex-1 text-center text-body-base font-semibold first-letter:uppercase" aria-live="polite">{{ monthLabel() }}</span>
          <button type="button" class="gef-icon-btn min-h-[44px] min-w-[44px]" aria-label="Próximo mês" (click)="shiftMonth(1)">
            <gef-icon name="chevron-right" [size]="20" />
          </button>
        </div>
        <div #grid role="grid" class="-mx-3" [attr.aria-label]="monthLabel()">
          <div role="row" class="grid grid-cols-7">
            @for (weekday of weekdays; track weekday.short) {
              <div role="columnheader" class="py-1 text-center text-caption font-semibold text-gefinc-muted first-letter:uppercase" [attr.aria-label]="weekday.long">{{ weekday.short }}</div>
            }
          </div>
          @for (week of weeks(); track $index) {
            <div role="row" class="grid grid-cols-7">
              @for (iso of week; track $index) {
                <div role="gridcell" [attr.aria-selected]="iso ? iso === isoValue() : null">
                  @if (iso) {
                    <button
                      type="button"
                      class="gef-day"
                      [attr.data-day]="iso"
                      [attr.aria-label]="dayLabel(iso)"
                      [attr.aria-current]="iso === today ? 'date' : null"
                      [attr.tabindex]="iso === tabDay() ? 0 : -1"
                      [disabled]="outOfRange(iso)"
                      (click)="pick(iso)"
                      (keydown)="onGridKeydown($event)"
                    >{{ dayNumber(iso) }}</button>
                  }
                </div>
              }
            </div>
          }
        </div>
        <div class="mt-3 flex justify-end">
          <button type="button" class="gef-btn-sm" [disabled]="outOfRange(today)" (click)="pick(today)">Hoje</button>
        </div>
      }
    </gef-sheet>
  `,
})
export class DateField implements ControlValueAccessor, Validator {
  readonly label = input.required<string>();
  /** Id do campo de texto (para testes e para ligar o rótulo); sem ele, um id próprio é gerado. */
  readonly inputId = input<string | null>(null);
  /** Menor data aceita (ISO). */
  readonly min = input<string | null>(null);
  /** Maior data aceita (ISO). */
  readonly max = input<string | null>(null);
  /** Id de um texto de apoio externo (ex.: a dica sob a data), somado ao `aria-describedby` do campo. */
  readonly describedBy = input<string | null>(null);

  protected readonly weekdays = WEEKDAYS;
  protected readonly initialFocus = 'button[data-day][tabindex="0"]';
  protected readonly fieldId = `gef-date-field-${nextId++}`;
  protected readonly errorId = `${this.fieldId}-error`;

  protected readonly fieldInputId = computed(() => this.inputId() ?? this.fieldId);
  protected readonly text = signal('');
  protected readonly blurred = signal(false);
  protected readonly disabled = signal(false);
  protected readonly opened = signal(false);
  protected today = todayIso();
  private readonly viewYear = signal(0);
  private readonly viewMonth = signal(0);
  private readonly focusDate = signal('');

  private readonly injector = inject(Injector);
  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');

  private readonly evaluation = computed<{ status: Status; iso: string }>(() => {
    const text = this.text();
    if (!text) {
      return { status: 'empty', iso: '' };
    }
    if (text.length < 10) {
      return { status: 'incomplete', iso: '' };
    }
    const iso = brToIso(text);
    if (!iso) {
      return { status: 'invalid', iso: '' };
    }
    return this.outOfRange(iso) ? { status: 'out', iso: '' } : { status: 'ok', iso };
  });
  /** Data ISO do texto atual; vazia enquanto o texto não é uma data válida dentro do período. */
  protected readonly isoValue = computed(() => this.evaluation().iso);

  protected readonly showError = computed(() => {
    const { status } = this.evaluation();
    if (status === 'empty' || status === 'ok') {
      return false;
    }
    return status === 'incomplete' ? this.blurred() : true;
  });
  protected readonly errorMessage = computed(() => {
    if (this.evaluation().status !== 'out') {
      return 'Informe uma data válida no formato dd/mm/aaaa.';
    }
    const min = this.min();
    const max = this.max();
    if (min && max) {
      return `Escolha uma data entre ${isoToBR(min)} e ${isoToBR(max)}.`;
    }
    return min ? `A data não pode ser anterior a ${isoToBR(min)}.` : `A data não pode ser posterior a ${isoToBR(max ?? '')}.`;
  });
  protected readonly describedByIds = computed(() => [this.describedBy(), this.showError() ? this.errorId : null].filter(Boolean).join(' ') || null);

  protected readonly monthLabel = computed(() => MONTH_FORMAT.format(new Date(Date.UTC(this.viewYear(), this.viewMonth() - 1, 1))));
  protected readonly weeks = computed(() => monthWeeks(this.viewYear(), this.viewMonth()));
  /** Dia que entra na ordem de Tab da grade: o focado, ou o primeiro permitido do mês se o focado está fora do período. */
  protected readonly tabDay = computed(() => {
    const focus = this.focusDate();
    const inView = (iso: string) => iso.startsWith(`${String(this.viewYear()).padStart(4, '0')}-${String(this.viewMonth()).padStart(2, '0')}-`);
    if (inView(focus) && !this.outOfRange(focus)) {
      return focus;
    }
    return this.weeks().flat().find((iso) => iso !== null && !this.outOfRange(iso)) ?? null;
  });

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private onValidatorChange: () => void = () => undefined;

  writeValue(value: string | null | undefined): void {
    this.text.set(value && parseIso(value) ? isoToBR(value) : '');
    this.onValidatorChange();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  validate(): ValidationErrors | null {
    const { status } = this.evaluation();
    return status === 'ok' || status === 'empty' ? null : { date: true };
  }

  protected outOfRange(iso: string): boolean {
    const min = this.min();
    const max = this.max();
    return (!!min && iso < min) || (!!max && iso > max);
  }

  protected onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const pasted = pastedDate(input.value);
    const caret = input.selectionStart ?? input.value.length;
    const digitsBefore = input.value.slice(0, caret).replace(/\D/g, '').length;
    const masked = pasted ?? mask(input.value.replace(/\D/g, '').slice(0, 8));
    input.value = masked;
    let position = 0;
    if (pasted) {
      position = masked.length;
    } else {
      for (let seen = 0; position < masked.length && seen < digitsBefore; position++) {
        if (/\d/.test(masked[position])) {
          seen++;
        }
      }
    }
    input.setSelectionRange(position, position);
    this.text.set(masked);
    this.onChange(this.isoValue());
    this.onValidatorChange();
  }

  protected onBlur(): void {
    this.blurred.set(true);
    this.onTouched();
  }

  protected openCalendar(): void {
    if (this.disabled()) {
      return;
    }
    this.today = todayIso();
    const current = this.isoValue();
    let start = current || this.today;
    const min = this.min();
    const max = this.max();
    if (min && start < min) {
      start = min;
    } else if (max && start > max) {
      start = max;
    }
    this.show(start);
    this.opened.set(true);
  }

  protected close(): void {
    this.opened.set(false);
    this.onTouched();
  }

  protected pick(iso: string): void {
    if (this.outOfRange(iso)) {
      return;
    }
    this.text.set(isoToBR(iso));
    this.onChange(iso);
    this.onValidatorChange();
    this.close();
  }

  protected shiftMonth(delta: number): void {
    this.show(addMonths(this.focusDate(), delta));
  }

  protected dayNumber(iso: string): number {
    return Number(iso.slice(8, 10));
  }

  protected dayLabel(iso: string): string {
    const d = parseIso(iso);
    return d ? DAY_FORMAT.format(new Date(Date.UTC(d.year, d.month - 1, d.day))) : iso;
  }

  protected onGridKeydown(event: KeyboardEvent): void {
    const current = (event.target as HTMLElement).closest<HTMLElement>('[data-day]')?.dataset['day'];
    if (!current) {
      return;
    }
    const target = this.targetFor(event.key, current);
    if (target === null) {
      return;
    }
    event.preventDefault();
    if (this.outOfRange(target)) {
      return;
    }
    this.show(target);
    this.focusDay(target);
  }

  private targetFor(key: string, from: string): string | null {
    switch (key) {
      case 'ArrowLeft':
        return addDays(from, -1);
      case 'ArrowRight':
        return addDays(from, 1);
      case 'ArrowUp':
        return addDays(from, -7);
      case 'ArrowDown':
        return addDays(from, 7);
      case 'Home':
        return addDays(from, -weekdayOf(from));
      case 'End':
        return addDays(from, 6 - weekdayOf(from));
      case 'PageUp':
        return addMonths(from, -1);
      case 'PageDown':
        return addMonths(from, 1);
      default:
        return null;
    }
  }

  /** Mostra o mês da data e a deixa como o dia com foco. */
  private show(iso: string): void {
    const d = parseIso(iso);
    if (!d) {
      return;
    }
    this.focusDate.set(iso);
    this.viewYear.set(d.year);
    this.viewMonth.set(d.month);
  }

  private focusDay(iso: string): void {
    const focus = () => this.grid()?.nativeElement.querySelector<HTMLElement>(`button[data-day="${iso}"]`)?.focus();
    // o mês pode ter mudado: o botão do dia só existe depois da próxima renderização
    afterNextRender(focus, { injector: this.injector });
  }
}
