import { Component, OnInit, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import type { CategoryType, RecurrenceType, TransactionGroupInput } from '@gefinc/core-models';
import { ReferenceData, TransactionsApi, messageFor, toProblem } from '../api';
import { accountsFor, reconcileAccount } from '../accounts/account-rules';
import { AccountPicker } from '../accounts/account-picker';
import { AmountModeSwitch } from './amount-mode-switch';
import { MoneyInput } from '../money-input/money-input';
import { incomeDateHint } from './income-hint';
import { KindSwitch } from './kind-switch';
import { formatBRL, invoiceDueDate, isoToBR, monthLabelBR, scheduleInstallments, todayIso } from '@gefinc/utils';
import { type AmountMode, belowMinimumPerInstallment, effectiveTotal, installmentSummary } from './installment-amount';

/** O valor precisa ser maior que zero (sem nenhum dígito diferente de zero, é zero). */
function positiveAmount(control: AbstractControl): ValidationErrors | null {
  const value = control.value as string | null;
  return value && !/[1-9]/.test(value) ? { positive: true } : null;
}

/** A quantidade de parcelas é um inteiro de 1 a 120 (vazio, zero, fracionário ou acima de 120 é inválido). */
function installmentCount(control: AbstractControl): ValidationErrors | null {
  const value = Number(control.value);
  return Number.isInteger(value) && value >= 1 && value <= 120 ? null : { installmentCount: true };
}

const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  VARIABLE: 'Avulso',
  FIXED: 'Fixo mensal',
  INSTALLMENT: 'Parcelado',
};

/** Cadastro de lançamento avulso, fixo mensal ou parcelado (FR-017 a FR-024). */
@Component({
  selector: 'gef-group-form',
  imports: [AccountPicker, AmountModeSwitch, KindSwitch, ReactiveFormsModule, MoneyInput],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4 gef-card p-4" novalidate>
      <h2 class="text-title-md font-semibold">Novo lançamento</h2>
      @if (error(); as message) {
        <p class="gef-alert-error" role="alert">{{ message }}</p>
      }
      <fieldset>
        <legend class="gef-label">Natureza</legend>
        <gef-kind-switch formControlName="kind" />
      </fieldset>
      <div>
        <gef-money-input
          size="hero"
          [tone]="kind() === 'INCOME' ? 'income' : 'expense'"
          [label]="amountLabel()"
          formControlName="totalAmount"
        />
        @if (form.controls.totalAmount.touched && form.controls.totalAmount.invalid) {
          <p class="gef-field-error">Informe um valor maior que zero.</p>
        }
        @if (serverErrors()['totalAmount']; as message) {
          <p class="gef-field-error">{{ message }}</p>
        }
        @if (amountError(); as message) {
          <p class="gef-field-error" role="alert">{{ message }}</p>
        }
        @if (recurrence() === 'INSTALLMENT') {
          <gef-amount-mode-switch class="mt-3 block" order="total-first" [value]="amountMode()" [count]="count()" (changed)="amountMode.set($event.mode)" />
        }
      </div>
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
          <label class="gef-label" for="description">Descrição ou loja</label>
          <input id="description" class="gef-input" formControlName="description" maxlength="120" />
          @if (form.controls.description.touched && form.controls.description.invalid) {
            <p class="gef-field-error">Informe a descrição.</p>
          }
        </div>
        <div>
          <gef-account-picker
            label="Conta ou cartão"
            placeholder="Selecione…"
            formControlName="accountId"
            [accounts]="pickerAccounts()"
            [emptyMessage]="kind() === 'INCOME' ? 'Cadastre uma conta para receber.' : 'Cadastre uma conta ou cartão para lançar.'"
          />
          @if (form.controls.accountId.touched && form.controls.accountId.value === 0) {
            <p class="gef-field-error">Escolha a conta.</p>
          }
          @if (serverErrors()['accountId']; as message) {
            <p class="gef-field-error">{{ message }}</p>
          }
          <p class="mt-1 text-caption text-gefinc-warning" aria-live="polite" data-testid="account-notice">{{ accountNotice() }}</p>
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
        @if (recurrence() === 'INSTALLMENT') {
          <div>
            <label class="gef-label" for="totalInstallments">Quantidade de parcelas</label>
            <input
              id="totalInstallments"
              class="gef-input"
              type="number"
              min="1"
              max="120"
              formControlName="totalInstallments"
              [attr.aria-invalid]="installmentsInvalid() ? 'true' : null"
              [attr.aria-describedby]="installmentsInvalid() ? 'totalInstallments-error' : null"
            />
            @if (installmentsInvalid()) {
              <p id="totalInstallments-error" class="gef-field-error" role="alert">Informe de 1 a 120 parcelas.</p>
            }
            @if (serverErrors()['totalInstallments']; as message) {
              <p class="gef-field-error">{{ message }}</p>
            }
          </div>
        }
        @if (kind() === 'INCOME') {
          <div>
            <label class="gef-label" for="purchaseDate">{{ recurrence() === 'VARIABLE' ? 'Data do recebimento' : 'Primeiro recebimento' }}</label>
            <input id="purchaseDate" class="gef-input" type="date" formControlName="purchaseDate" />
            <p class="mt-1 text-caption text-gefinc-muted" aria-live="polite" data-testid="income-hint">{{ incomeHint() }}</p>
          </div>
        } @else {
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
        }
      </div>
      @if (recurrence() === 'INSTALLMENT' && installmentPreview().length > 0) {
        <div class="gef-card space-y-3 p-3">
          <p class="financial-value text-body-base font-semibold" aria-live="polite" data-testid="installment-summary">{{ summary() }}</p>
          <div class="overflow-x-auto rounded-lg border border-gefinc-border" aria-label="Prévia das parcelas">
            <table class="w-full text-left text-body-base">
              <thead class="text-caption uppercase text-gefinc-muted">
                <tr>
                  <th class="px-3 py-2">Parcela</th>
                  @if (cardSelected()) {
                    <th class="px-3 py-2">Fatura</th>
                  }
                  <th class="px-3 py-2">Vencimento</th>
                  <th class="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                @for (item of installmentPreview(); track item.number) {
                  <tr class="border-t border-gefinc-border">
                    <td class="px-3 py-1.5">{{ item.number }}/{{ installmentPreview().length }}</td>
                    @if (cardSelected()) {
                      <td class="px-3 py-1.5">{{ item.invoice }} · vence {{ item.dueShort }}</td>
                    }
                    <td class="px-3 py-1.5">{{ item.due }}</td>
                    <td class="financial-value px-3 py-1.5 text-right">{{ item.amount }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
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
    // Só vale no tipo Parcelado: nos demais o controle fica desabilitado (oculto) e não bloqueia o envio.
    totalInstallments: [{ value: 2, disabled: true }, [installmentCount]],
    purchaseDate: [todayIso(), Validators.required],
    firstDueDate: [todayIso()],
  });

  private readonly accountId = signal(0);
  protected readonly kind = signal<CategoryType>('EXPENSE');
  private readonly purchaseDate = signal(todayIso());
  protected readonly recurrence = signal<RecurrenceType>('VARIABLE');
  private readonly amount = signal<string | null>(null);
  protected readonly count = signal(2);
  /** O valor digitado é o total da compra (padrão) ou o valor de cada parcela. */
  protected readonly amountMode = signal<AmountMode>('TOTAL');
  protected readonly amountLabel = computed(() => {
    if (this.recurrence() !== 'INSTALLMENT') {
      return 'Valor';
    }
    return this.amountMode() === 'INSTALLMENT' ? 'Valor da parcela' : 'Valor total';
  });
  /** Total que vai ao servidor: no modo parcela, valor × quantidade (centavos em bigint). */
  private readonly installmentTotal = computed(() => effectiveTotal(this.amount(), this.count(), this.amountMode()));
  protected readonly cardSelected = computed(() => this.selectedAccount()?.type === 'CREDIT_CARD');
  /** Aviso no campo de valor quando o total não cobre um centavo por parcela. */
  protected readonly amountError = computed(() => {
    const total = this.installmentTotal();
    if (this.recurrence() !== 'INSTALLMENT' || !total || !/[1-9]/.test(total) || !Number.isInteger(this.count()) || this.count() < 1) {
      return '';
    }
    return belowMinimumPerInstallment(total, this.count()) ? 'O valor deve ter pelo menos R$ 0,01 por parcela.' : '';
  });
  protected readonly summary = computed(() => {
    const total = this.installmentTotal();
    return total ? installmentSummary(total, this.count()) : '';
  });
  private readonly firstDueDate = signal(todayIso());

  /** Contas que a natureza aceita (receita nunca lista cartão); a inativa só fica se já estiver escolhida. */
  protected readonly pickerAccounts = computed(() =>
    accountsFor(
      this.kind(),
      this.reference.accounts().filter((a) => a.active || a.id === this.accountId()),
    ),
  );
  protected readonly accountNotice = signal('');
  /** Dica sob a data da receita: já entra na conta ou fica a receber até a data. */
  protected readonly incomeHint = computed(() => {
    return incomeDateHint(this.purchaseDate(), todayIso());
  });
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
    const total = this.installmentTotal();
    if (this.recurrence() !== 'INSTALLMENT' || !account || !total) {
      return [];
    }
    try {
      const card = account.type === 'CREDIT_CARD';
      return scheduleInstallments({
        closingDay: card ? account.closingDay : undefined,
        dueDay: card ? account.dueDay : undefined,
        purchaseDate: this.purchaseDate(),
        firstDueDate: card ? undefined : this.firstDueDate(),
        total,
        count: this.count(),
      }).map((item) => ({
        number: item.number,
        due: isoToBR(item.dueDate),
        invoice: monthLabelBR(item.dueDate),
        dueShort: isoToBR(item.dueDate).slice(0, 5),
        amount: formatBRL(item.amount),
      }));
    } catch {
      return [];
    }
  });

  /** Dados para preencher o formulário (ex.: corrigir uma operação recusada); aplicados uma vez, quando as contas e categorias chegam. */
  readonly initial = input<TransactionGroupInput | null>(null);
  private initialApplied = false;

  constructor() {
    effect(() => {
      const initial = this.initial();
      if (!initial || !this.reference.loaded() || this.initialApplied) {
        return;
      }
      untracked(() => {
        this.initialApplied = true;
        const category = this.reference.category(initial.categoryId);
        const kind = category?.type ?? 'EXPENSE';
        // Receita tem uma só data (a do recebimento); operações antigas podem trazer duas.
        const date = kind === 'INCOME' ? (initial.firstDueDate ?? initial.purchaseDate) : initial.purchaseDate;
        // Trocar a natureza zera a categoria: por isso a categoria vem depois.
        this.form.controls.kind.setValue(kind);
        this.amountMode.set('TOTAL');
        this.form.patchValue({
          recurrenceType: initial.recurrenceType,
          description: initial.description,
          accountId: initial.accountId,
          categoryId: initial.categoryId,
          totalAmount: initial.totalAmount,
          totalInstallments: initial.totalInstallments ?? 2,
          purchaseDate: date,
          firstDueDate: kind === 'INCOME' ? date : (initial.firstDueDate ?? initial.purchaseDate),
        });
        this.reconcile(kind);
      });
    });
  }

  ngOnInit(): void {
    this.reference.refresh();
    this.form.controls.accountId.valueChanges.subscribe((v) => {
      this.accountId.set(Number(v));
      this.accountNotice.set('');
    });
    this.form.controls.kind.valueChanges.subscribe((v) => {
      this.kind.set(v);
      this.form.controls.categoryId.setValue(0);
      if (v === 'INCOME') {
        this.form.controls.firstDueDate.setValue(this.form.controls.purchaseDate.value);
      }
      this.reconcile(v);
    });
    this.form.controls.purchaseDate.valueChanges.subscribe((v) => {
      this.purchaseDate.set(v);
      // Receita tem uma só data: o recebimento vale como data do lançamento e como vencimento.
      if (this.kind() === 'INCOME') {
        this.form.controls.firstDueDate.setValue(v);
      }
    });
    this.form.controls.recurrenceType.valueChanges.subscribe((v) => {
      this.recurrence.set(v);
      const installments = this.form.controls.totalInstallments;
      if (v === 'INSTALLMENT') {
        installments.enable();
      } else {
        installments.disable();
      }
    });
    this.form.controls.totalAmount.valueChanges.subscribe((v) => this.amount.set(v));
    this.form.controls.totalInstallments.valueChanges.subscribe((v) => this.count.set(Number(v)));
    this.form.controls.firstDueDate.valueChanges.subscribe((v) => this.firstDueDate.set(v));
  }

  /** Troca a conta quando ela não vale para a natureza (cartão em receita) e explica a troca. */
  private reconcile(kind: CategoryType): void {
    const current = Number(this.form.controls.accountId.value);
    if (current === 0) {
      return;
    }
    const next = reconcileAccount(kind, this.reference.accounts(), current);
    if (next === current) {
      return;
    }
    this.form.controls.accountId.setValue(next);
    const name = this.reference.account(next)?.name;
    this.accountNotice.set(name ? `Cartão não recebe receita; conta trocada para ${name}.` : 'Cartão não recebe receita; escolha uma conta.');
  }

  /** Quantidade de parcelas inválida e já tocada (ou após tentar enviar). */
  protected installmentsInvalid(): boolean {
    const control = this.form.controls.totalInstallments;
    return control.touched && control.invalid;
  }

  protected submit(): void {
    if (this.busy()) {
      return;
    }
    const value = this.form.getRawValue();
    const income = value.kind === 'INCOME';
    const card = this.selectedAccount()?.type === 'CREDIT_CARD';
    const installment = value.recurrenceType === 'INSTALLMENT';
    const totalAmount = installment ? this.installmentTotal() : value.totalAmount;
    if (this.form.invalid || Number(value.accountId) === 0 || Number(value.categoryId) === 0 || !totalAmount || this.amountError()) {
      this.form.markAllAsTouched();
      return;
    }
    const input: TransactionGroupInput = {
      description: value.description.trim(),
      recurrenceType: value.recurrenceType,
      totalAmount,
      ...(installment ? { totalInstallments: Number(value.totalInstallments) } : {}),
      accountId: Number(value.accountId),
      categoryId: Number(value.categoryId),
      purchaseDate: value.purchaseDate,
      ...(card ? {} : { firstDueDate: income ? value.purchaseDate : value.firstDueDate }),
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
