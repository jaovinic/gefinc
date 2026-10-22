import { Component, effect, inject, input, output, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ACCOUNT_TYPES, type Account, type AccountIcon, type AccountType, type HolderType } from '@gefinc/core-models';
import { AccountsApi, messageFor, toProblem } from '../api';
import { IconPicker } from './icon-picker';
import { AccountPicker } from './account-picker';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: 'Conta bancária',
  CASH: 'Dinheiro',
  CREDIT_CARD: 'Cartão de crédito',
};

export const HOLDER_LABELS: Record<HolderType, string> = {
  PF: 'Pessoa física',
  PJ: 'Pessoa jurídica',
};

/**
 * Regras por tipo: conta bancária exige o titular (PF ou PJ); cartão exige a conta bancária e os
 * dias de fechamento e vencimento (1 a 31); dinheiro não tem nada disso.
 */
function profile(group: AbstractControl): ValidationErrors | null {
  const type = group.get('type')?.value as AccountType;
  const errors: Record<string, boolean> = {};
  if (type === 'CHECKING' && !group.get('holderType')?.value) {
    errors['holderType'] = true;
  }
  if (type === 'CREDIT_CARD') {
    if (!group.get('bankAccountId')?.value) {
      errors['bankAccountId'] = true;
    }
    for (const field of ['closingDay', 'dueDay']) {
      const value = group.get(field)?.value as number | null;
      if (value === null || !Number.isInteger(value) || value < 1 || value > 31) {
        errors[field] = true;
      }
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

@Component({
  selector: 'gef-account-form',
  imports: [ReactiveFormsModule, IconPicker, AccountPicker],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4 rounded-xl border border-gefinc-border bg-gefinc-surface p-4" novalidate>
      <h2 class="text-title-md font-semibold">{{ account() ? 'Editar conta' : 'Nova conta' }}</h2>
      @if (error(); as message) {
        <p class="gef-alert-error" role="alert">{{ message }}</p>
      }
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="gef-label" for="type">Tipo</label>
          <select id="type" class="gef-input" formControlName="type">
            @for (type of types; track type) {
              <option [value]="type">{{ labels[type] }}</option>
            }
          </select>
        </div>
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

        @if (form.controls.type.value === 'CHECKING') {
          <fieldset class="sm:col-span-2">
            <legend class="gef-label">Titular</legend>
            <div class="flex gap-2" data-field="holderType">
              @for (holder of holders; track holder) {
                <label class="gef-segment">
                  <input type="radio" formControlName="holderType" [value]="holder" [id]="'holder-' + holder" />
                  <span>{{ holderLabels[holder] }}</span>
                </label>
              }
            </div>
            @if (form.touched && form.errors?.['holderType']) {
              <p class="gef-field-error">Escolha pessoa física ou jurídica.</p>
            }
            @if (serverErrors()['holderType']; as message) {
              <p class="gef-field-error">{{ message }}</p>
            }
          </fieldset>
        }

        @if (form.controls.type.value === 'CREDIT_CARD') {
          <div class="sm:col-span-2" data-field="bankAccountId">
            @if (banks().length === 0) {
              <p class="gef-alert-warning">Cadastre uma conta bancária antes de criar um cartão.</p>
              <button type="button" class="gef-btn-secondary mt-2" (click)="newBankRequested.emit()">Cadastrar conta bancária</button>
            } @else {
              <gef-account-picker label="Conta bancária" placeholder="Escolha a conta do cartão" formControlName="bankAccountId" [accounts]="banks()" />
              @if (account() && !account()!.bankAccountId) {
                <p class="mt-1 text-caption text-gefinc-warning">Este cartão ainda não tem conta: vincule a uma conta bancária.</p>
              }
            }
            @if (form.touched && form.errors?.['bankAccountId'] && banks().length > 0) {
              <p class="gef-field-error">Escolha a conta bancária do cartão.</p>
            }
            @if (serverErrors()['bankAccountId']; as message) {
              <p class="gef-field-error">{{ message }}</p>
            }
          </div>
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

        <div class="sm:col-span-2">
          <span class="gef-label" id="icon-label">Ícone</span>
          <gef-icon-picker label="Ícone" formControlName="icon" />
        </div>

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
  /** Contas bancárias disponíveis para vincular a um cartão. */
  readonly banks = input<Account[]>([]);
  /** Muda para recomeçar o formulário do zero (ex.: atalho para cadastrar a conta bancária). */
  readonly resetToken = input(0);
  readonly saved = output<void>();
  readonly cancelled = output<void>();
  /** O usuário quer cadastrar uma conta bancária antes de criar o cartão. */
  readonly newBankRequested = output<void>();

  protected readonly types = ACCOUNT_TYPES;
  protected readonly labels = ACCOUNT_TYPE_LABELS;
  protected readonly holders: HolderType[] = ['PF', 'PJ'];
  protected readonly holderLabels = HOLDER_LABELS;
  protected readonly form = this.fb.group(
    {
      name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(80)]),
      type: this.fb.nonNullable.control<AccountType>('CHECKING'),
      holderType: this.fb.control<HolderType | null>(null),
      icon: this.fb.control<AccountIcon | null>(null),
      bankAccountId: this.fb.control<number | null>(null),
      closingDay: this.fb.control<number | null>(null),
      dueDay: this.fb.control<number | null>(null),
    },
    { validators: profile },
  );
  protected readonly error = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      const account = this.account();
      this.resetToken();
      this.form.reset({
        name: account?.name ?? '',
        type: account?.type ?? 'CHECKING',
        holderType: account?.type === 'CHECKING' ? (account.holderType ?? 'PF') : null,
        icon: account?.icon ?? null,
        bankAccountId: account?.bankAccountId ?? null,
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
    // Sugere o nome do cartão a partir do banco escolhido, sem sobrescrever o que o usuário digitou.
    this.form.controls.bankAccountId.valueChanges.subscribe((id) => {
      const bank = this.banks().find((b) => b.id === id);
      const name = this.form.controls.name;
      if (bank && !this.account() && this.form.controls.type.value === 'CREDIT_CARD' && !name.dirty) {
        name.setValue(`Cartão ${bank.name}`);
      }
    });
  }

  protected submit(): void {
    if (this.busy()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const body = {
      name: raw.name,
      type: raw.type,
      ...(raw.type === 'CHECKING' && raw.holderType ? { holderType: raw.holderType } : {}),
      ...(raw.type === 'CREDIT_CARD'
        ? { closingDay: raw.closingDay ?? undefined, dueDay: raw.dueDay ?? undefined, bankAccountId: raw.bankAccountId ?? undefined }
        : {}),
      ...(raw.icon ? { icon: raw.icon } : {}),
    };
    const account = this.account();
    this.error.set(null);
    this.serverErrors.set({});
    this.busy.set(true);
    const request = account
      ? this.api.update(account.id, { ...body, active: account.active, version: account.version })
      : this.api.create(body);
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
