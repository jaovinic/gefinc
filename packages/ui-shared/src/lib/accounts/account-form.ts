import { Component, effect, inject, input, output, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ACCOUNT_TYPES, type Account, type AccountType } from '@gefinc/core-models';
import { AccountsApi, messageFor, toProblem } from '../api';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: 'Conta bancária',
  CASH: 'Dinheiro',
  CREDIT_CARD: 'Cartão de crédito',
};

/** Cartão exige os dias de fechamento e vencimento (1 a 31); os demais tipos não têm dias. */
function cardDays(group: AbstractControl): ValidationErrors | null {
  if (group.get('type')?.value !== 'CREDIT_CARD') {
    return null;
  }
  const errors: Record<string, boolean> = {};
  for (const field of ['closingDay', 'dueDay']) {
    const value = group.get(field)?.value as number | null;
    if (value === null || !Number.isInteger(value) || value < 1 || value > 31) {
      errors[field] = true;
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

@Component({
  selector: 'gef-account-form',
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4 rounded-xl border border-gefinc-border bg-gefinc-surface p-4" novalidate>
      <h2 class="text-title-md font-semibold">{{ account() ? 'Editar conta' : 'Nova conta' }}</h2>
      @if (error(); as message) {
        <p class="gef-alert-error" role="alert">{{ message }}</p>
      }
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="gef-label" for="name">Nome</label>
          <input id="name" class="gef-input" formControlName="name" maxlength="80" />
          @if (form.controls.name.touched && form.controls.name.invalid) {
            <p class="gef-field-error">Informe o nome.</p>
          }
          @if (serverErrors()['name']; as message) {
            <p class="gef-field-error">{{ message }}</p>
          }
        </div>
        <div>
          <label class="gef-label" for="type">Tipo</label>
          <select id="type" class="gef-input" formControlName="type">
            @for (type of types; track type) {
              <option [value]="type">{{ labels[type] }}</option>
            }
          </select>
        </div>
        @if (form.controls.type.value === 'CREDIT_CARD') {
          <div>
            <label class="gef-label" for="closingDay">Dia de fechamento da fatura</label>
            <input id="closingDay" class="gef-input" type="number" min="1" max="31" formControlName="closingDay" />
            @if (form.touched && form.errors?.['closingDay']) {
              <p class="gef-field-error">Informe um dia entre 1 e 31.</p>
            }
          </div>
          <div>
            <label class="gef-label" for="dueDay">Dia de vencimento da fatura</label>
            <input id="dueDay" class="gef-input" type="number" min="1" max="31" formControlName="dueDay" />
            @if (form.touched && form.errors?.['dueDay']) {
              <p class="gef-field-error">Informe um dia entre 1 e 31.</p>
            }
          </div>
        }
        @if (account()?.type === 'CREDIT_CARD') {
          <p class="text-caption text-gefinc-muted sm:col-span-2" data-testid="card-days-notice">
            Ao mudar os dias, só as ocorrências de lançamentos fixos pendentes e com vencimento futuro serão
            recalculadas; o restante permanece como está.
          </p>
        }
      </div>
      <div class="flex gap-3">
        <button type="submit" class="gef-btn-primary max-w-40" [disabled]="busy()">Salvar</button>
        <button type="button" class="gef-btn-secondary" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </form>
  `,
})
export class AccountForm {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AccountsApi);

  readonly account = input<Account | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly types = ACCOUNT_TYPES;
  protected readonly labels = ACCOUNT_TYPE_LABELS;
  protected readonly form = this.fb.group(
    {
      name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(80)]),
      type: this.fb.nonNullable.control<AccountType>('CHECKING'),
      closingDay: this.fb.control<number | null>(null),
      dueDay: this.fb.control<number | null>(null),
    },
    { validators: cardDays },
  );
  protected readonly error = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      const account = this.account();
      this.form.reset({
        name: account?.name ?? '',
        type: account?.type ?? 'CHECKING',
        closingDay: account?.closingDay ?? null,
        dueDay: account?.dueDay ?? null,
      });
      // O tipo não muda depois do cadastro.
      if (account) {
        this.form.controls.type.disable();
      } else {
        this.form.controls.type.enable();
      }
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, closingDay, dueDay } = this.form.getRawValue();
    const type = this.form.getRawValue().type;
    const days = type === 'CREDIT_CARD' ? { closingDay: closingDay ?? undefined, dueDay: dueDay ?? undefined } : {};
    const account = this.account();
    this.error.set(null);
    this.serverErrors.set({});
    this.busy.set(true);
    const request = account
      ? this.api.update(account.id, { name, type, ...days, active: account.active, version: account.version })
      : this.api.create({ name, type, ...days });
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.saved.emit();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        const problem = toProblem(e);
        this.serverErrors.set(problem.fieldErrors);
        this.error.set(messageFor(problem));
      },
    });
  }
}
