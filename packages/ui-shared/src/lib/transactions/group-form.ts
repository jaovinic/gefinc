import { Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import type { CategoryType, RecurrenceType, TransactionGroupInput } from '@gefinc/core-models';
import { ReferenceData, TransactionsApi, messageFor, toProblem } from '../api';
import { MoneyInput } from '../money-input/money-input';
import { formatBRL, invoiceDueDate, isoToBR, scheduleInstallments, todayIso } from '@gefinc/utils';

/** O valor precisa ser maior que zero (sem nenhum dígito diferente de zero, é zero). */
function positiveAmount(control: AbstractControl): ValidationErrors | null {
  const value = control.value as string | null;
  return value && !/[1-9]/.test(value) ? { positive: true } : null;
}

const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  VARIABLE: 'Avulso',
  FIXED: 'Fixo mensal',
  INSTALLMENT: 'Parcelado',
};

/** Cadastro de lançamento avulso, fixo mensal ou parcelado (FR-017 a FR-024). */
@Component({
  selector: 'gef-group-form',
  imports: [ReactiveFormsModule, MoneyInput],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4 rounded-xl border border-gefinc-border bg-gefinc-surface p-4" novalidate>
      <h2 class="text-title-md font-semibold">Novo lançamento</h2>
      @if (error(); as message) {
        <p class="gef-alert-error" role="alert">{{ message }}</p>
      }
      <div class="grid gap-4 sm:grid-cols-3">
        <div>
          <label class="gef-label" for="recurrenceType">Tipo</label>
          <select id="recurrenceType" class="gef-input" formControlName="recurrenceType">
            @for (type of recurrenceTypes; track type) {
              <option [value]="type">{{ labels[type] }}</option>
            }
          </select>
        </div>
        <div>
          <label class="gef-label" for="kind">Natureza</label>
          <select id="kind" class="gef-input" formControlName="kind">
            <option value="EXPENSE">Despesa</option>
            <option value="INCOME">Receita</option>
          </select>
        </div>
        <div>
          <label class="gef-label" for="description">Descrição ou loja</label>
          <input id="description" class="gef-input" formControlName="description" maxlength="120" />
          @if (form.controls.description.touched && form.controls.description.invalid) {
            <p class="gef-field-error">Informe a descrição.</p>
          }
        </div>
        <div>
          <label class="gef-label" for="accountId">Conta ou cartão</label>
          <select id="accountId" class="gef-input" formControlName="accountId">
            <option value="0">Selecione…</option>
            @for (account of activeAccounts(); track account.id) {
              <option [value]="account.id">{{ account.name }}</option>
            }
          </select>
          @if (form.controls.accountId.touched && form.controls.accountId.value === 0) {
            <p class="gef-field-error">Escolha a conta.</p>
          }
        </div>
        <div>
          <label class="gef-label" for="categoryId">Categoria</label>
          <select id="categoryId" class="gef-input" formControlName="categoryId">
            <option value="0">Selecione…</option>
            @for (category of categoryOptions(); track category.id) {
              <option [value]="category.id">{{ category.name }}</option>
            }
          </select>
          @if (form.controls.categoryId.touched && form.controls.categoryId.value === 0) {
            <p class="gef-field-error">Escolha a categoria.</p>
          }
        </div>
        <div>
          <gef-money-input [label]="recurrence() === 'INSTALLMENT' ? 'Valor total' : 'Valor'" formControlName="totalAmount" />
          @if (form.controls.totalAmount.touched && form.controls.totalAmount.invalid) {
            <p class="gef-field-error">Informe um valor maior que zero.</p>
          }
        </div>
        @if (recurrence() === 'INSTALLMENT') {
          <div>
            <label class="gef-label" for="totalInstallments">Quantidade de parcelas</label>
            <input id="totalInstallments" class="gef-input" type="number" min="1" max="120" formControlName="totalInstallments" />
            @if (serverErrors()['totalInstallments']; as message) {
              <p class="gef-field-error">{{ message }}</p>
            }
          </div>
        }
        <div>
          <label class="gef-label" for="purchaseDate">Data da compra</label>
          <input id="purchaseDate" class="gef-input" type="date" formControlName="purchaseDate" />
        </div>
        @if (selectedAccount()?.type === 'CREDIT_CARD') {
          <div class="sm:col-span-2">
            <p class="gef-label">Vencimento</p>
            <p class="text-body-base text-gefinc-muted" aria-live="polite">
              {{ dueDatePreview() ? 'Vence em ' + dueDatePreview() + ' (definido pela fatura do cartão).' : '—' }}
            </p>
          </div>
        } @else {
          <div>
            <label class="gef-label" for="firstDueDate">{{ form.controls.recurrenceType.value === 'FIXED' ? 'Primeiro vencimento' : 'Vencimento' }}</label>
            <input id="firstDueDate" class="gef-input" type="date" formControlName="firstDueDate" />
            @if (serverErrors()['firstDueDate']; as message) {
              <p class="gef-field-error">{{ message }}</p>
            }
          </div>
        }
      </div>
      @if (recurrence() === 'INSTALLMENT' && installmentPreview().length > 0) {
        <div class="overflow-x-auto rounded-lg border border-gefinc-border" aria-label="Prévia das parcelas">
          <table class="w-full text-left text-body-base">
            <thead class="text-caption uppercase text-gefinc-muted">
              <tr><th class="px-3 py-2">Parcela</th><th class="px-3 py-2">Vencimento</th><th class="px-3 py-2 text-right">Valor</th></tr>
            </thead>
            <tbody>
              @for (item of installmentPreview(); track item.number) {
                <tr class="border-t border-gefinc-border">
                  <td class="px-3 py-1.5">{{ item.number }}/{{ installmentPreview().length }}</td>
                  <td class="px-3 py-1.5">{{ item.due }}</td>
                  <td class="financial-value px-3 py-1.5 text-right">{{ item.amount }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      <div class="flex gap-3">
        <button type="submit" class="gef-btn-primary max-w-40" [disabled]="busy()">Salvar</button>
        <button type="button" class="gef-btn-secondary" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </form>
  `,
})
export class GroupForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(TransactionsApi);
  protected readonly reference = inject(ReferenceData);

  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly recurrenceTypes: RecurrenceType[] = ['VARIABLE', 'FIXED', 'INSTALLMENT'];
  protected readonly labels = RECURRENCE_LABELS;
  protected readonly error = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    recurrenceType: ['VARIABLE' as RecurrenceType],
    kind: ['EXPENSE' as CategoryType],
    description: ['', [Validators.required, Validators.maxLength(120)]],
    accountId: [0],
    categoryId: [0],
    totalAmount: this.fb.control<string | null>(null, [Validators.required, positiveAmount]),
    totalInstallments: [2, [Validators.min(1), Validators.max(120)]],
    purchaseDate: [todayIso(), Validators.required],
    firstDueDate: [todayIso()],
  });

  private readonly accountId = signal(0);
  private readonly kind = signal<CategoryType>('EXPENSE');
  private readonly purchaseDate = signal(todayIso());
  protected readonly recurrence = signal<RecurrenceType>('VARIABLE');
  private readonly amount = signal<string | null>(null);
  private readonly count = signal(2);
  private readonly firstDueDate = signal(todayIso());

  protected readonly activeAccounts = computed(() => this.reference.accounts().filter((a) => a.active));
  protected readonly selectedAccount = computed(() => this.reference.accounts().find((a) => a.id === this.accountId()));
  protected readonly categoryOptions = computed(() => this.reference.categories().filter((c) => c.type === this.kind()));
  protected readonly dueDatePreview = computed(() => {
    const account = this.selectedAccount();
    const purchase = this.purchaseDate();
    if (account?.type !== 'CREDIT_CARD' || !account.closingDay || !account.dueDay || !purchase) {
      return '';
    }
    try {
      return isoToBR(invoiceDueDate(purchase, account.closingDay, account.dueDay));
    } catch {
      return '';
    }
  });

  /** Prévia das parcelas pela mesma regra do servidor (`packages/utils`). */
  protected readonly installmentPreview = computed(() => {
    const account = this.selectedAccount();
    const amount = this.amount();
    if (this.recurrence() !== 'INSTALLMENT' || !account || !amount) {
      return [];
    }
    try {
      const card = account.type === 'CREDIT_CARD';
      return scheduleInstallments({
        closingDay: card ? account.closingDay : undefined,
        dueDay: card ? account.dueDay : undefined,
        purchaseDate: this.purchaseDate(),
        firstDueDate: card ? undefined : this.firstDueDate(),
        total: amount,
        count: this.count(),
      }).map((item) => ({ number: item.number, due: isoToBR(item.dueDate), amount: formatBRL(item.amount) }));
    } catch {
      return [];
    }
  });

  ngOnInit(): void {
    this.reference.refresh();
    this.form.controls.accountId.valueChanges.subscribe((v) => this.accountId.set(Number(v)));
    this.form.controls.kind.valueChanges.subscribe((v) => {
      this.kind.set(v);
      this.form.controls.categoryId.setValue(0);
    });
    this.form.controls.purchaseDate.valueChanges.subscribe((v) => this.purchaseDate.set(v));
    this.form.controls.recurrenceType.valueChanges.subscribe((v) => this.recurrence.set(v));
    this.form.controls.totalAmount.valueChanges.subscribe((v) => this.amount.set(v));
    this.form.controls.totalInstallments.valueChanges.subscribe((v) => this.count.set(Number(v)));
    this.form.controls.firstDueDate.valueChanges.subscribe((v) => this.firstDueDate.set(v));
  }

  protected submit(): void {
    if (this.busy()) {
      return;
    }
    const value = this.form.getRawValue();
    const card = this.selectedAccount()?.type === 'CREDIT_CARD';
    if (this.form.invalid || Number(value.accountId) === 0 || Number(value.categoryId) === 0 || !value.totalAmount) {
      this.form.markAllAsTouched();
      return;
    }
    const input: TransactionGroupInput = {
      description: value.description.trim(),
      recurrenceType: value.recurrenceType,
      totalAmount: value.totalAmount,
      ...(value.recurrenceType === 'INSTALLMENT' ? { totalInstallments: Number(value.totalInstallments) } : {}),
      accountId: Number(value.accountId),
      categoryId: Number(value.categoryId),
      purchaseDate: value.purchaseDate,
      ...(card ? {} : { firstDueDate: value.firstDueDate }),
    };
    this.error.set(null);
    this.serverErrors.set({});
    this.busy.set(true);
    this.api.createGroup(input).subscribe({
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
