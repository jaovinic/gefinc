import { Component, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { CategoryType, TransactionGroupInput } from '@gefinc/core-models';
import {
  AccountPicker,
  type AmountMode,
  DraftService,
  Icon,
  KindSwitch,
  MoneyInput,
  NoticeService,
  ReferenceData,
  TransactionsApi,
  accountsFor,
  belowMinimumPerInstallment,
  effectiveTotal,
  incomeDateHint,
  installmentSummary,
  messageFor,
  reconcileAccount,
  toProblem,
} from '@gefinc/ui-shared';
import { formatBRL, invoiceDueDate, isoToBR, monthLabelBR, scheduleInstallments, todayIso } from '@gefinc/utils';
import { QuickExpenseDefaults, type QuickKind } from '../quick-expense/quick-expense-defaults.service';

/** Chave única do rascunho: guarda também a natureza escolhida. */
const DRAFT_KEY = 'quick-new';

interface Draft {
  kind: CategoryType;
  amount: string | null;
  description: string;
  accountId: number;
  categoryId: number;
  date: string;
  /** Rascunhos antigos não têm: assumem 1x e o valor da parcela. */
  installments?: number;
  amountMode?: AmountMode;
}

/** Máximo de parcelas oferecido na tela rápida (o servidor aceita até 120, no cadastro completo). */
const MAX_QUICK_INSTALLMENTS = 24;
const INSTALLMENT_OPTIONS = Array.from({ length: MAX_QUICK_INSTALLMENTS }, (_, i) => i + 1);
const MIN_PER_INSTALLMENT_MESSAGE = 'O valor deve ter pelo menos R$ 0,01 por parcela.';

const quickKind = (kind: CategoryType): QuickKind => (kind === 'INCOME' ? 'income' : 'expense');

/**
 * Novo lançamento rápido, avulso: primeiro se escolhe receita ou despesa (`?tipo=despesa|receita`,
 * padrão despesa); o valor vem em destaque e focado, e conta, categoria e data já preenchidas (últimas
 * usadas, por natureza). A partir da tela inicial são 2 toques (abrir e salvar) e 3 para receita
 * (trocar a natureza). Receita nunca usa cartão: entra na conta na data (hoje ou antes) ou fica a
 * receber até a data. Fixo fica no "Novo lançamento" completo, em Lançamentos. Despesa no cartão aceita
 * parcelamento ("10 parcelas de R$ 100,00"): cada parcela cai na fatura do seu mês; parcelamento fora do
 * cartão também fica no cadastro completo.
 */
@Component({
  selector: 'gef-new-entry-page',
  imports: [AccountPicker, Icon, KindSwitch, ReactiveFormsModule, MoneyInput, RouterLink],
  template: `
    <div class="gef-screen">
      <header class="gef-app-header">
        <a routerLink="/" class="gef-btn-sm w-11 px-0" aria-label="Cancelar"><gef-icon name="close" [size]="18" /></a>
        <h1 class="whitespace-nowrap text-title-md font-bold">Novo lançamento</h1>
        <span class="w-11" aria-hidden="true"></span>
      </header>
      <form [formGroup]="form" (ngSubmit)="save()" class="space-y-5 p-4 pb-10" novalidate>
        @if (error(); as message) {
          <p class="gef-alert-error" role="alert">{{ message }}</p>
        }
        <gef-kind-switch formControlName="kind" (picked)="onKindPicked($event)" />
        <gef-money-input
          [label]="moneyLabel()"
          size="hero"
          [tone]="isIncome() ? 'income' : 'expense'"
          [autofocus]="true"
          formControlName="amount"
        />
        @if (serverErrors()['totalAmount']; as message) {
          <p class="gef-field-error">{{ message }}</p>
        }
        @if (parcelado()) {
          <div class="space-y-2">
            <div class="flex gap-2" role="group" aria-label="Forma de informar">
              <button
                type="button"
                class="gef-btn-sm flex-1"
                [class.gef-btn-sm-primary]="amountMode() === 'INSTALLMENT'"
                [attr.aria-pressed]="amountMode() === 'INSTALLMENT'"
                (click)="setAmountMode('INSTALLMENT', $event)"
              >Valor da parcela</button>
              <button
                type="button"
                class="gef-btn-sm flex-1"
                [class.gef-btn-sm-primary]="amountMode() === 'TOTAL'"
                [attr.aria-pressed]="amountMode() === 'TOTAL'"
                (click)="setAmountMode('TOTAL', $event)"
              >Valor total</button>
            </div>
            @if (summary(); as text) {
              <p class="financial-value text-center text-body-base font-semibold" aria-live="polite" data-testid="installment-summary">{{ text }}</p>
            }
          </div>
        }
        <div>
          <label class="gef-label" for="description">Descrição (opcional)</label>
          <input
            id="description"
            class="gef-input"
            formControlName="description"
            maxlength="120"
            [placeholder]="isIncome() ? 'Ex.: Salário' : 'Ex.: Mercado'"
            autocomplete="off"
            autocapitalize="sentences"
            enterkeyhint="next"
          />
        </div>
        <div>
          <label class="gef-label" for="categoryId">Categoria</label>
          <select id="categoryId" class="gef-input" formControlName="categoryId">
            @for (category of categories(); track category.id) {
              <option [value]="category.id">{{ category.name }}</option>
            }
          </select>
        </div>
        <div>
          <gef-account-picker
            [label]="isIncome() ? 'Conta' : 'Conta ou cartão'"
            formControlName="accountId"
            [accounts]="pickerAccounts()"
            [emptyMessage]="isIncome() ? 'Cadastre uma conta para receber.' : 'Cadastre uma conta ou cartão para lançar.'"
          />
          @if (serverErrors()['accountId']; as message) {
            <p class="gef-field-error">{{ message }}</p>
          }
          <p class="mt-1 text-caption text-gefinc-warning" aria-live="polite" data-testid="account-notice">{{ accountNotice() }}</p>
        </div>
        @if (showInstallments()) {
          <div>
            <label class="gef-label" for="installments">Parcelas</label>
            <select id="installments" class="gef-input" formControlName="installments">
              @for (option of installmentOptions; track option) {
                <option [value]="option">{{ option === 1 ? 'À vista (1x)' : option + 'x' }}</option>
              }
            </select>
            @if (serverErrors()['totalInstallments']; as message) {
              <p class="gef-field-error">{{ message }}</p>
            }
          </div>
        }
        <div>
          <label class="gef-label" for="date">{{ isIncome() ? 'Data do recebimento' : 'Data' }}</label>
          <div class="flex items-center gap-2">
            <input id="date" class="gef-input min-w-0 flex-1" type="date" formControlName="date" />
            <button
              type="button"
              class="gef-btn-sm"
              [class.gef-btn-sm-primary]="date() === today"
              [attr.aria-pressed]="date() === today"
              (click)="setDay(0)"
            >Hoje</button>
            <button
              type="button"
              class="gef-btn-sm"
              [class.gef-btn-sm-primary]="date() === yesterday"
              [attr.aria-pressed]="date() === yesterday"
              (click)="setDay(-1)"
            >Ontem</button>
          </div>
          <p class="mt-1 text-caption text-gefinc-muted" aria-live="polite" data-testid="date-hint">{{ hint() }}</p>
        </div>
        @if (previewRows(); as rows) {
          @if (rows.length > 0) {
            <div class="rounded-lg border border-gefinc-border p-3 text-caption text-gefinc-muted" data-testid="installment-preview">
              <ul class="space-y-1">
                <li class="financial-value">{{ rows[0].text }}</li>
                @if (rows.length > 2) {
                  <li>
                    <details>
                      <summary class="cursor-pointer text-gefinc-secondary">Ver todas as parcelas</summary>
                      <ul class="mt-1 space-y-1">
                        @for (row of rows.slice(1, -1); track row.number) {
                          <li class="financial-value">{{ row.text }}</li>
                        }
                      </ul>
                    </details>
                  </li>
                }
                <li class="financial-value">{{ rows[rows.length - 1].text }}</li>
              </ul>
              @if (hasOverdue()) {
                <p class="mt-2 text-gefinc-warning" data-testid="installment-overdue">Há parcelas com vencimento no passado: elas já nascem vencidas.</p>
              }
            </div>
          }
        }
        <button type="submit" class="gef-btn-primary" [disabled]="busy()">{{ busy() ? 'Salvando…' : 'Salvar' }}</button>
      </form>
    </div>
  `,
})
export class NewEntryPage implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(TransactionsApi);
  private readonly router = inject(Router);
  private readonly drafts = inject(DraftService);
  private readonly defaults = inject(QuickExpenseDefaults);
  private readonly route = inject(ActivatedRoute);
  private readonly notices = inject(NoticeService);
  protected readonly reference = inject(ReferenceData);
  private readonly amountField = viewChild(MoneyInput);

  protected readonly today = todayIso();
  protected readonly yesterday = todayIso(new Date(Date.now() - 86_400_000));

  protected readonly form = this.fb.nonNullable.group({
    kind: ['EXPENSE' as CategoryType],
    amount: this.fb.control<string | null>(null, Validators.required),
    description: [''],
    accountId: [0],
    categoryId: [0],
    date: [todayIso(), Validators.required],
    installments: [1],
  });
  protected readonly installmentOptions = INSTALLMENT_OPTIONS;
  protected readonly error = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly accountNotice = signal('');
  protected readonly busy = signal(false);

  protected readonly kind = signal<CategoryType>(this.route.snapshot.queryParamMap.get('tipo') === 'receita' ? 'INCOME' : 'EXPENSE');
  protected readonly isIncome = computed(() => this.kind() === 'INCOME');
  private readonly accountId = signal(0);
  protected readonly date = signal(todayIso());
  private readonly amount = signal<string | null>(null);
  private readonly count = signal(1);
  /** Com parcelas, o número digitado é o valor da parcela (padrão) ou o total da compra. */
  protected readonly amountMode = signal<AmountMode>('INSTALLMENT');

  private readonly selectedAccount = computed(() => this.reference.account(this.accountId()));
  private readonly isCard = computed(() => this.selectedAccount()?.type === 'CREDIT_CARD');
  /** Parcelas só para despesa em cartão; receita, conta bancária e dinheiro são sempre à vista. */
  protected readonly showInstallments = computed(() => !this.isIncome() && this.isCard());
  private readonly installments = computed(() => (this.showInstallments() ? this.count() : 1));
  protected readonly parcelado = computed(() => this.installments() >= 2);
  protected readonly moneyLabel = computed(() => {
    if (!this.parcelado()) {
      return 'Valor';
    }
    return this.amountMode() === 'INSTALLMENT' ? 'Valor da parcela' : 'Valor total';
  });
  /** Total efetivo: no modo parcela, valor × parcelas (centavos em bigint); no modo total, como digitado. */
  private readonly total = computed(() => (this.parcelado() ? effectiveTotal(this.amount(), this.installments(), this.amountMode()) : this.amount()));
  protected readonly summary = computed(() => {
    const total = this.total();
    return this.parcelado() && total ? installmentSummary(total, this.installments()) : '';
  });
  private readonly plan = computed(() => {
    const account = this.selectedAccount();
    const total = this.total();
    if (!this.parcelado() || !account?.closingDay || !account.dueDay || !total || !this.date()) {
      return [];
    }
    try {
      return scheduleInstallments({
        closingDay: account.closingDay,
        dueDay: account.dueDay,
        purchaseDate: this.date(),
        total,
        count: this.installments(),
      });
    } catch {
      return [];
    }
  });
  protected readonly previewRows = computed(() => {
    const count = this.installments();
    return this.plan().map((item) => ({
      number: item.number,
      text: `${item.number}/${count} · fatura de ${monthLabelBR(item.dueDate)} · vence ${isoToBR(item.dueDate).slice(0, 5)} · ${formatBRL(item.amount)}`,
    }));
  });
  protected readonly hasOverdue = computed(() => this.plan().some((item) => item.dueDate < this.today));

  /** Contas que a natureza aceita (receita nunca lista cartão); a inativa só fica se já estiver escolhida. */
  protected readonly pickerAccounts = computed(() =>
    accountsFor(
      this.kind(),
      this.reference.accounts().filter((a) => a.active || a.id === this.accountId()),
    ),
  );
  protected readonly categories = computed(() => this.reference.categories().filter((c) => c.type === this.kind()));

  /** Dica sob a data, por natureza: quando o valor entra na conta ou quando vence. */
  protected readonly hint = computed(() => {
    const date = this.date();
    if (!date) {
      return '';
    }
    if (this.isIncome()) {
      return incomeDateHint(date, this.today);
    }
    const account = this.reference.account(this.accountId());
    if (account?.type === 'CREDIT_CARD') {
      try {
        if (!account.closingDay || !account.dueDay) {
          return '';
        }
        const due = isoToBR(invoiceDueDate(date, account.closingDay, account.dueDay));
        return this.parcelado() ? `1ª parcela na fatura que vence em ${due}` : `Entra na fatura que vence em ${due}`;
      } catch {
        return '';
      }
    }
    return 'Vence na data';
  });

  private applied = false;
  private unregisterDraft: (() => void) | null = null;

  constructor() {
    this.form.controls.kind.setValue(this.kind(), { emitEvent: false });
    // Aplica os padrões (últimas conta e categoria) quando os dados de referência chegam, uma única vez.
    effect(() => {
      if (!this.reference.loaded() || this.reference.accounts().length === 0 || this.applied) {
        return;
      }
      this.applied = true;
      const draft = this.drafts.take<Draft>(DRAFT_KEY);
      if (draft) {
        this.kind.set(draft.kind);
        this.form.patchValue({ ...draft, installments: draft.installments ?? 1 }, { emitEvent: false });
        this.accountId.set(Number(draft.accountId));
        this.date.set(draft.date);
        this.amount.set(draft.amount);
        this.amountMode.set(draft.amountMode ?? 'INSTALLMENT');
        this.count.set(draft.installments ?? 1);
        this.resetInstallmentsIfNotApplicable();
        return;
      }
      const { accountId, categoryId } = this.defaults.resolve(this.reference.accounts(), this.reference.categories(), quickKind(this.kind()));
      this.form.patchValue({ accountId, categoryId }, { emitEvent: false });
      this.accountId.set(accountId);
    });
    this.form.controls.accountId.valueChanges.subscribe((v) => {
      this.accountId.set(Number(v));
      this.accountNotice.set('');
      this.resetInstallmentsIfNotApplicable();
    });
    this.form.controls.amount.valueChanges.subscribe((v) => this.amount.set(v));
    this.form.controls.installments.valueChanges.subscribe((v) => this.count.set(Number(v)));
    this.form.controls.date.valueChanges.subscribe((v) => this.date.set(v));
    this.form.controls.kind.valueChanges.subscribe((v) => this.onKindChange(v));
  }

  ngOnInit(): void {
    // As duas naturezas ficam carregadas: trocar de Despesa para Receita não espera o aparelho.
    void this.defaults.load('expense');
    void this.defaults.load('income');
    this.reference.refresh();
    this.unregisterDraft = this.drafts.register(
      DRAFT_KEY,
      (): Draft => ({ ...this.form.getRawValue(), installments: this.installments(), amountMode: this.amountMode() }),
    );
  }

  ngOnDestroy(): void {
    this.unregisterDraft?.();
  }

  protected setDay(offset: number): void {
    this.form.controls.date.setValue(offset === 0 ? this.today : this.yesterday);
  }

  /**
   * O toque no seletor tira o foco do valor: devolve, para o teclado numérico seguir aberto. Pelo
   * teclado (setas do grupo de opções) ou leitor de tela o foco fica onde está.
   */
  protected onKindPicked(source: 'pointer' | 'keyboard'): void {
    if (source === 'pointer') {
      this.amountField()?.focus();
    }
  }

  /**
   * Alternar o modo não converte o número digitado. O foco volta ao valor (para o teclado numérico
   * seguir aberto) só quando o acionamento veio de toque ou mouse (`detail > 0`); por Enter/Espaço ou
   * leitor de tela (`detail === 0`) o foco fica no botão.
   */
  protected setAmountMode(mode: AmountMode, event: MouseEvent): void {
    this.amountMode.set(mode);
    if (event.detail > 0) {
      this.amountField()?.focus();
    }
  }

  /** Receita, conta bancária e dinheiro não parcelam: a escolha volta para à vista. */
  private resetInstallmentsIfNotApplicable(): void {
    if (this.showInstallments() || this.count() === 1) {
      return;
    }
    this.count.set(1);
    this.form.controls.installments.setValue(1, { emitEvent: false });
  }

  /** Trocar a natureza recalcula a categoria padrão e troca a conta quando ela não vale (cartão em receita). */
  private onKindChange(kind: CategoryType): void {
    this.kind.set(kind);
    this.serverErrors.set({});
    this.resetInstallmentsIfNotApplicable();
    const resolved = this.defaults.resolve(this.reference.accounts(), this.reference.categories(), quickKind(kind));
    this.form.controls.categoryId.setValue(resolved.categoryId);
    const current = Number(this.form.controls.accountId.value);
    const next = reconcileAccount(kind, this.reference.accounts(), current, resolved.accountId);
    if (next === current) {
      return;
    }
    this.form.controls.accountId.setValue(next);
    if (current === 0) {
      return;
    }
    const name = this.reference.account(next)?.name;
    this.accountNotice.set(name ? `Cartão não recebe receita; conta trocada para ${name}.` : 'Cartão não recebe receita; escolha uma conta.');
  }

  protected save(): void {
    if (this.busy()) {
      return;
    }
    const value = this.form.getRawValue();
    const income = value.kind === 'INCOME';
    const accountId = Number(value.accountId);
    const categoryId = Number(value.categoryId);
    if (!value.amount) {
      this.error.set(income ? 'Informe o valor da receita.' : 'Informe o valor da despesa.');
      return;
    }
    if (accountId === 0 || categoryId === 0) {
      this.error.set(`Cadastre uma conta e escolha a categoria para lançar a ${income ? 'receita' : 'despesa'}.`);
      return;
    }
    const account = this.reference.accounts().find((a) => a.id === accountId);
    const category = this.reference.categories().find((c) => c.id === categoryId);
    const count = this.installments();
    const installment = count >= 2;
    const totalAmount = installment ? effectiveTotal(value.amount, count, this.amountMode()) : value.amount;
    if (!totalAmount || (installment && belowMinimumPerInstallment(totalAmount, count))) {
      this.error.set(MIN_PER_INSTALLMENT_MESSAGE);
      return;
    }
    const input: TransactionGroupInput = {
      description: value.description.trim() || category?.name || (income ? 'Receita' : 'Despesa'),
      recurrenceType: installment ? 'INSTALLMENT' : 'VARIABLE',
      totalAmount,
      ...(installment ? { totalInstallments: count } : {}),
      accountId,
      categoryId,
      purchaseDate: value.date,
      // Receita tem uma só data (a do recebimento); despesa fora de cartão vence na data; cartão (inclusive
      // parcelado) segue o fechamento e o vencimento da fatura, sem firstDueDate.
      ...(income || account?.type !== 'CREDIT_CARD' ? { firstDueDate: value.date } : {}),
    };
    this.error.set(null);
    this.serverErrors.set({});
    this.busy.set(true);
    this.api.createGroup(input).subscribe({
      next: () => {
        this.busy.set(false);
        void this.defaults.remember(accountId, categoryId, quickKind(value.kind));
        this.notices.toast(income ? 'Receita registrada.' : installment ? `Despesa registrada em ${count}x.` : 'Despesa registrada.');
        void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
        void this.router.navigate(['/']);
      },
      error: (e: unknown) => {
        // Mantém tudo o que foi digitado para o usuário tentar de novo.
        this.busy.set(false);
        const problem = toProblem(e);
        this.serverErrors.set(problem.fieldErrors);
        this.error.set(messageFor(problem));
      },
    });
  }
}
