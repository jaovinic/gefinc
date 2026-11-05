import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import type { Account, Transfer, TransferInput } from '@gefinc/core-models';
import { addMoney, formatBRL, isoToBR, subMoney, toCents, todayIso } from '@gefinc/utils';
import { AccountPicker } from '../accounts/account-picker';
import { transferableAccounts } from '../accounts/account-rules';
import { BalancesApi, TransfersApi, messageFor, toProblem } from '../api';
import { DateField } from '../date-field/date-field';
import { Icon } from '../icons/icon';
import { MoneyInput } from '../money-input/money-input';

/** Faixa de datas aceita pelo servidor (anos de 1900 a 2200). */
const MIN_TRANSFER_DATE = '1900-01-01';
const MAX_TRANSFER_DATE = '2200-12-31';

/** Saldo de uma das contas antes e depois da transferência, para a prévia do formulário. */
interface PreviewRow {
  id: string;
  account: Account;
  before: string | null;
  after: string | null;
  negative: boolean;
}

/**
 * Formulário de transferência entre contas (criar e editar), para um `gef-sheet`. Origem e destino só
 * aceitam contas bancárias e de dinheiro ativas (cartão nunca); o destino não oferece a origem. A prévia
 * mostra o saldo resultante das duas contas e avisa, com ícone e texto, quando algum ficar negativo; saldo
 * insuficiente não bloqueia (mesma política das despesas). Exige conexão: sem ela o servidor (ou o
 * interceptor) devolve o aviso e o formulário o exibe sem perder o que foi digitado.
 */
@Component({
  selector: 'gef-transfer-form',
  host: { class: 'block' },
  imports: [ReactiveFormsModule, AccountPicker, DateField, Icon, MoneyInput],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4" novalidate>
      @if (error(); as message) {
        <p class="gef-alert-error" role="alert" data-testid="transfer-error">{{ message }}</p>
      }
      <div data-field="fromAccountId">
        <gef-account-picker
          label="Conta de origem"
          placeholder="Escolha a conta de origem"
          formControlName="fromAccountId"
          [accounts]="eligible()"
          emptyMessage="Cadastre uma conta bancária ou de dinheiro ativa para transferir."
        />
        @if (submitted() && !form.controls.fromAccountId.value) {
          <p class="gef-field-error">Escolha a conta de origem.</p>
        }
        @if (serverErrors()['fromAccountId']; as message) {
          <p class="gef-field-error">{{ message }}</p>
        }
      </div>
      <div data-field="toAccountId">
        <gef-account-picker
          label="Conta de destino"
          placeholder="Escolha a conta de destino"
          formControlName="toAccountId"
          [accounts]="destinations()"
          emptyMessage="Não há outra conta bancária ou de dinheiro ativa para receber."
        />
        @if (submitted() && !form.controls.toAccountId.value) {
          <p class="gef-field-error">Escolha a conta de destino.</p>
        }
        @if (serverErrors()['toAccountId']; as message) {
          <p class="gef-field-error">{{ message }}</p>
        }
      </div>
      <div data-field="amount">
        <gef-money-input label="Valor" formControlName="amount" />
        @if (submitted() && !amountValid()) {
          <p class="gef-field-error">Informe um valor maior que zero.</p>
        }
        @if (serverErrors()['amount']; as message) {
          <p class="gef-field-error">{{ message }}</p>
        }
      </div>
      <div data-field="transferDate">
        <gef-date-field inputId="transferDate" label="Data" formControlName="transferDate" [min]="minDate" [max]="maxDate" />
        @if (submitted() && !form.controls.transferDate.value) {
          <p class="gef-field-error">Informe a data.</p>
        }
        @if (serverErrors()['transferDate']; as message) {
          <p class="gef-field-error">{{ message }}</p>
        }
      </div>
      <div data-field="description">
        <label class="gef-label" for="transferDescription">Descrição (opcional)</label>
        <input id="transferDescription" class="gef-input" formControlName="description" maxlength="120" autocomplete="off" />
        @if (serverErrors()['description']; as message) {
          <p class="gef-field-error">{{ message }}</p>
        }
      </div>

      @if (rows().length > 0) {
        <section class="rounded-lg border border-gefinc-border p-3" aria-label="Prévia dos saldos" aria-live="polite" data-testid="transfer-preview">
          <h3 class="mb-2 text-caption font-semibold uppercase text-gefinc-muted">Saldo após a transferência</h3>
          <ul class="space-y-2">
            @for (row of rows(); track row.id) {
              <li class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1" [attr.data-row]="row.id">
                <span class="min-w-0 truncate font-medium">{{ row.account.name }}</span>
                <span class="financial-value whitespace-nowrap" [class.text-gefinc-danger]="row.negative" data-testid="preview-after">
                  @if (row.before !== null && row.after !== null) {
                    <span class="text-gefinc-muted">{{ money(row.before) }}</span> → {{ money(row.after) }}
                  } @else {
                    <span class="text-gefinc-muted" data-testid="preview-unavailable">Saldo indisponível</span>
                  }
                </span>
              </li>
              @if (row.negative) {
                <li class="gef-alert-warning flex items-start gap-2" data-testid="negative-warning">
                  <gef-icon name="alert" [size]="16" class="mt-0.5 shrink-0" />
                  <span>O saldo de {{ row.account.name }} ficará negativo ({{ money(row.after!) }}). A transferência é permitida mesmo assim.</span>
                </li>
              }
            }
          </ul>
          @if (scheduledNote(); as note) {
            <p class="mt-2 text-caption text-gefinc-muted" data-testid="scheduled-note">{{ note }}</p>
          }
        </section>
      }

      <div class="flex gap-3">
        <button type="submit" class="gef-btn-primary max-w-40" [disabled]="busy()">{{ busy() ? 'Salvando…' : 'Transferir' }}</button>
        <button type="button" class="gef-btn-secondary" (click)="cancelled.emit()">Cancelar</button>
      </div>
    </form>
  `,
})
export class TransferForm {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(TransfersApi);
  private readonly balancesApi = inject(BalancesApi);

  /** Transferência em edição; `null` cria uma nova. */
  readonly transfer = input<Transfer | null>(null);
  /** Todas as contas do usuário; o formulário oferece só as bancárias e de dinheiro ativas. */
  readonly accounts = input.required<Account[]>();
  /** Origem pré-selecionada (ação "Transferir" de uma conta). */
  readonly initialFromId = input<number | null>(null);
  /** Muda para recomeçar o formulário do zero. */
  readonly resetToken = input(0);
  readonly saved = output<Transfer>();
  readonly cancelled = output<void>();

  protected readonly form = this.fb.group({
    fromAccountId: this.fb.control<number | null>(null),
    toAccountId: this.fb.control<number | null>(null),
    amount: this.fb.control<string | null>(null),
    transferDate: this.fb.nonNullable.control(todayIso()),
    description: this.fb.nonNullable.control(''),
  });
  protected readonly minDate = MIN_TRANSFER_DATE;
  protected readonly maxDate = MAX_TRANSFER_DATE;
  protected readonly error = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  /** Os erros de campo só aparecem depois de uma tentativa de salvar (o painel não cresce no meio do toque). */
  protected readonly submitted = signal(false);
  /** Saldo atual por conta (`null` enquanto não carregou ou se falhou: a prévia diz "indisponível", sem bloquear). */
  private readonly balances = signal<Map<number, string> | null>(null);

  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly eligible = computed(() => transferableAccounts(this.accounts()));
  protected readonly destinations = computed(() => this.eligible().filter((a) => a.id !== this.values().fromAccountId));

  /** Chave de idempotência da tentativa: reutilizada no reenvio do mesmo corpo, nova quando algo muda. */
  private attempt: { key: string; fingerprint: string } | null = null;

  protected readonly amountValid = computed(() => {
    const amount = this.values().amount;
    return !!amount && toCents(amount) > 0n;
  });

  protected readonly rows = computed<PreviewRow[]>(() => {
    const v = this.values();
    const from = this.eligible().find((a) => a.id === v.fromAccountId);
    const to = this.eligible().find((a) => a.id === v.toAccountId);
    if (!from || !to || !this.amountValid()) {
      return [];
    }
    const amount = v.amount as string;
    const balances = this.balances();
    return [
      this.row('from', from, balances, (before) => subMoney(before, amount)),
      this.row('to', to, balances, (before) => addMoney(before, amount)),
    ];
  });

  protected readonly scheduledNote = computed(() => {
    const date = this.values().transferDate;
    return this.rows().length > 0 && date && date > todayIso()
      ? `Transferência agendada: os saldos só mudam em ${isoToBR(date)}. A prévia considera o saldo de hoje.`
      : null;
  });

  constructor() {
    effect(() => {
      const transfer = this.transfer();
      this.resetToken();
      // As contas só valem na abertura: recarregá-las (ex.: depois de um conflito) não pode apagar o que foi digitado.
      const eligible = untracked(() => this.eligible());
      const usable = (id: number | null | undefined) => (id != null && eligible.some((a) => a.id === id) ? id : null);
      this.submitted.set(false);
      this.error.set(null);
      this.serverErrors.set({});
      this.attempt = null;
      this.form.reset({
        fromAccountId: usable(transfer ? transfer.fromAccountId : this.initialFromId()),
        toAccountId: usable(transfer?.toAccountId),
        amount: transfer?.amount ?? null,
        transferDate: transfer?.transferDate ?? todayIso(),
        description: transfer?.description ?? '',
      });
    });
    // Origem e destino nunca coincidem: escolher o destino como origem limpa o destino.
    this.form.controls.fromAccountId.valueChanges.subscribe((from) => {
      if (from !== null && from === this.form.controls.toAccountId.value) {
        this.form.controls.toAccountId.setValue(null);
      }
    });
    this.loadBalances();
  }

  private loadBalances(): void {
    this.balancesApi.get().subscribe({
      next: (data) => this.balances.set(new Map(data.accounts.map((a) => [a.accountId, a.balance]))),
      error: () => this.balances.set(null),
    });
  }

  /**
   * Saldo atual da conta sem o efeito da transferência em edição (já aplicada ao saldo quando a data não é futura),
   * para a prévia não contar a mesma transferência duas vezes.
   */
  private baseBalance(account: Account, balances: Map<number, string>): string {
    const current = balances.get(account.id) ?? '0.00';
    const original = this.transfer();
    if (!original || original.transferDate > todayIso()) {
      return current;
    }
    if (original.fromAccountId === account.id) {
      return addMoney(current, original.amount);
    }
    return original.toAccountId === account.id ? subMoney(current, original.amount) : current;
  }

  private row(id: 'from' | 'to', account: Account, balances: Map<number, string> | null, apply: (before: string) => string): PreviewRow {
    if (balances === null) {
      return { id, account, before: null, after: null, negative: false };
    }
    const before = this.baseBalance(account, balances);
    const after = apply(before);
    return { id, account, before, after, negative: toCents(after) < 0n };
  }

  protected money(value: string): string {
    return formatBRL(value);
  }

  private keyFor(body: object): string {
    const fingerprint = JSON.stringify(body);
    if (!this.attempt || this.attempt.fingerprint !== fingerprint) {
      this.attempt = { key: crypto.randomUUID(), fingerprint };
    }
    return this.attempt.key;
  }

  protected submit(): void {
    if (this.busy()) {
      return;
    }
    const raw = this.form.getRawValue();
    if (raw.fromAccountId === null || raw.toAccountId === null || !this.amountValid() || !raw.transferDate) {
      this.submitted.set(true);
      return;
    }
    const description = raw.description.trim();
    const input: TransferInput = {
      fromAccountId: raw.fromAccountId,
      toAccountId: raw.toAccountId,
      amount: raw.amount as string,
      transferDate: raw.transferDate,
      ...(description ? { description } : {}),
    };
    const original = this.transfer();
    const body = original ? { ...input, version: original.version } : input;
    const key = this.keyFor(body);
    this.error.set(null);
    this.serverErrors.set({});
    this.busy.set(true);
    const request = original ? this.api.update(original.id, { ...input, version: original.version }, key) : this.api.create(input, key);
    request.subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.attempt = null;
        this.saved.emit(saved);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        const problem = toProblem(e);
        // Resposta definitiva (4xx): a mesma chave repetiria o erro guardado; o reenvio precisa de chave nova.
        if (problem.status >= 400 && problem.status < 500) {
          this.attempt = null;
        }
        this.serverErrors.set(problem.fieldErrors);
        this.error.set(messageFor(problem));
      },
    });
  }
}
