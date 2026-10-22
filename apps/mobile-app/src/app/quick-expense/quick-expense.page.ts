import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { IonContent } from '@ionic/angular';
import { Router, RouterLink } from '@angular/router';
import type { TransactionGroupInput } from '@gefinc/core-models';
import { DraftService, MoneyInput, ReferenceData, TransactionsApi, messageFor, toProblem } from '@gefinc/ui-shared';
import { todayIso } from '@gefinc/utils';
import { QuickExpenseDefaults } from './quick-expense-defaults.service';

interface Draft {
  amount: string | null;
  description: string;
  accountId: number;
  categoryId: number;
  date: string;
}

/**
 * Lançamento rápido de despesa avulsa (RNF03): a tela abre com o valor focado e conta, categoria e
 * data já preenchidas (últimas usadas); ajustes ficam no mesmo formulário e "Salvar" conclui.
 * A partir da tela inicial são 2 toques (abrir e salvar), dentro do limite de 3.
 */
@Component({
  selector: 'gef-quick-expense-page',
  imports: [IonContent, ReactiveFormsModule, MoneyInput, RouterLink],
  template: `
    <ion-content>
      <header class="gef-app-header">
        <a routerLink="/" class="text-body-base text-gefinc-secondary">Cancelar</a>
        <h1 class="text-title-md font-bold">Nova despesa</h1>
        <span class="w-14"></span>
      </header>
      <form [formGroup]="form" (ngSubmit)="save()" class="space-y-4 p-4" novalidate>
        @if (error(); as message) {
          <p class="gef-alert-error" role="alert">{{ message }}</p>
        }
        <gef-money-input label="Valor" [autofocus]="true" formControlName="amount" />
        <div>
          <label class="gef-label" for="description">Descrição (opcional)</label>
          <input id="description" class="gef-input" formControlName="description" maxlength="120" placeholder="Ex.: Mercado" />
        </div>
        <div>
          <label class="gef-label" for="accountId">Conta ou cartão</label>
          <select id="accountId" class="gef-input" formControlName="accountId">
            @for (account of activeAccounts(); track account.id) {
              <option [value]="account.id">{{ account.name }}</option>
            }
          </select>
        </div>
        <div>
          <label class="gef-label" for="categoryId">Categoria</label>
          <select id="categoryId" class="gef-input" formControlName="categoryId">
            @for (category of expenseCategories(); track category.id) {
              <option [value]="category.id">{{ category.name }}</option>
            }
          </select>
        </div>
        <div>
          <label class="gef-label" for="date">Data</label>
          <input id="date" class="gef-input" type="date" formControlName="date" />
        </div>
        <button type="submit" class="gef-btn-primary" [disabled]="busy()">Salvar</button>
      </form>
    </ion-content>
  `,
})
export class QuickExpensePage implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(TransactionsApi);
  private readonly router = inject(Router);
  private readonly drafts = inject(DraftService);
  private readonly defaults = inject(QuickExpenseDefaults);
  protected readonly reference = inject(ReferenceData);

  protected readonly form = this.fb.nonNullable.group({
    amount: this.fb.control<string | null>(null, Validators.required),
    description: [''],
    accountId: [0],
    categoryId: [0],
    date: [todayIso(), Validators.required],
  });
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly activeAccounts = computed(() => this.reference.accounts().filter((a) => a.active));
  protected readonly expenseCategories = computed(() => this.reference.categories().filter((c) => c.type === 'EXPENSE'));

  private applied = false;
  private unregisterDraft: (() => void) | null = null;

  constructor() {
    // Aplica os padrões (últimas conta e categoria) quando os dados de referência chegam, uma única vez.
    effect(() => {
      if (!this.reference.loaded() || this.reference.accounts().length === 0 || this.applied) {
        return;
      }
      this.applied = true;
      const { accountId, categoryId } = this.defaults.resolve(this.reference.accounts(), this.reference.categories());
      const draft = this.drafts.take<Draft>('quick-expense');
      this.form.patchValue(
        draft ?? { accountId, categoryId },
        { emitEvent: false },
      );
    });
  }

  ngOnInit(): void {
    void this.defaults.load();
    this.reference.refresh();
    this.unregisterDraft = this.drafts.register('quick-expense', () => this.form.getRawValue());
  }

  ngOnDestroy(): void {
    this.unregisterDraft?.();
  }

  protected save(): void {
    const value = this.form.getRawValue();
    const accountId = Number(value.accountId);
    const categoryId = Number(value.categoryId);
    if (!value.amount) {
      this.error.set('Informe o valor da despesa.');
      return;
    }
    if (accountId === 0 || categoryId === 0) {
      this.error.set('Cadastre uma conta e escolha a categoria para lançar a despesa.');
      return;
    }
    const account = this.reference.accounts().find((a) => a.id === accountId);
    const category = this.reference.categories().find((c) => c.id === categoryId);
    const input: TransactionGroupInput = {
      description: value.description.trim() || category?.name || 'Despesa',
      recurrenceType: 'VARIABLE',
      totalAmount: value.amount,
      accountId,
      categoryId,
      purchaseDate: value.date,
      ...(account?.type === 'CREDIT_CARD' ? {} : { firstDueDate: value.date }),
    };
    this.error.set(null);
    this.busy.set(true);
    this.api.createGroup(input).subscribe({
      next: () => {
        this.busy.set(false);
        void this.defaults.remember(accountId, categoryId);
        void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
        void this.router.navigate(['/']);
      },
      error: (e: unknown) => {
        // Mantém tudo o que foi digitado para o usuário tentar de novo.
        this.busy.set(false);
        this.error.set(messageFor(toProblem(e)));
      },
    });
  }
}
