import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import type { Account, HolderType } from '@gefinc/core-models';
import { AccountsApi, NoticeService, messageFor, toProblem } from '../api';
import { Sheet } from '../layout/sheet';
import { EmptyView, ErrorView, LoadingView } from '../state-views/state-views';
import { Viewport } from '../viewport/viewport';
import { AccountBadge } from './account-badge';
import { ACCOUNT_TYPE_LABELS, AccountForm, HOLDER_LABELS } from './account-form';

/** Cadastro de contas bancárias, dinheiro e cartões de crédito (FR-011 a FR-013). */
@Component({
  selector: 'gef-accounts-page',
  imports: [AccountBadge, AccountForm, EmptyView, ErrorView, LoadingView, Sheet],
  template: `
    <section class="space-y-4">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-title-lg font-bold">Contas e cartões</h1>
        <div class="flex items-center gap-4">
          <label class="flex min-h-11 items-center gap-2 text-body-base text-gefinc-muted md:min-h-0">
            <input type="checkbox" class="h-5 w-5" [checked]="showInactive()" (change)="toggleInactive($event)" />
            Mostrar inativas
          </label>
          <button type="button" class="gef-btn-secondary" (click)="startCreate()">Nova conta</button>
        </div>
      </header>

      @if (message(); as text) {
        <p class="gef-alert-error" role="alert">{{ text }}</p>
      }

      @if (formOpen()) {
        <gef-account-form
          [account]="editing()"
          [banks]="banks()"
          [resetToken]="formKey()"
          (saved)="onSaved()"
          (cancelled)="closeForm()"
          (newBankRequested)="newBank()"
        />
      }

      @if (showHolderFilter()) {
        <div class="flex gap-2" role="radiogroup" aria-label="Filtrar por titular" data-field="holderFilter">
          @for (option of holderFilters; track option.value) {
            <label class="gef-segment">
              <input type="radio" name="holderFilter" [checked]="holderFilter() === option.value" (change)="holderFilter.set(option.value)" />
              <span>{{ option.label }}</span>
            </label>
          }
        </div>
      }

      @if (loading()) {
        <gef-loading message="Carregando contas…" />
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" (retry)="load()" />
      } @else if (accounts().length === 0) {
        <gef-empty icon="accounts" title="Nenhuma conta cadastrada" hint="Cadastre uma conta, o dinheiro em espécie ou um cartão de crédito para começar.">
          <button type="button" class="gef-btn-secondary" (click)="startCreate()">Nova conta</button>
        </gef-empty>
      } @else if (viewport.compact()) {
        <ul class="space-y-3">
          @for (account of visible(); track account.id) {
            <li data-testid="account-card" class="rounded-xl border border-gefinc-border bg-gefinc-surface p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <gef-account-badge [account]="account" [showBank]="true" />
                  <p class="mt-1 text-caption text-gefinc-muted">
                    {{ labels[account.type] }}
                    @if (account.closingDay) {
                      · Fecha dia {{ account.closingDay }} · vence dia {{ account.dueDay }}
                    }
                  </p>
                </div>
                <span [class]="account.active ? 'text-gefinc-primary' : 'text-gefinc-muted'">
                  {{ account.active ? 'Ativa' : 'Inativa' }}
                </span>
              </div>
              <div class="mt-2 flex flex-wrap gap-2 border-t border-gefinc-border pt-2">
                <button type="button" class="gef-btn-sm" [attr.aria-label]="'Editar ' + account.name" (click)="startEdit(account)">Editar</button>
                <button type="button" class="gef-btn-sm" [attr.aria-label]="(account.active ? 'Inativar ' : 'Reativar ') + account.name" (click)="toggleActive(account)">
                  {{ account.active ? 'Inativar' : 'Reativar' }}
                </button>
                <button type="button" class="gef-btn-sm gef-btn-sm-danger" [attr.aria-label]="'Excluir ' + account.name" (click)="remove(account)">Excluir</button>
              </div>
            </li>
          }
        </ul>
      } @else {
        <div class="overflow-x-auto rounded-xl border border-gefinc-border">
          <table class="w-full text-left text-body-base">
            <thead class="bg-gefinc-surface text-caption uppercase text-gefinc-muted">
              <tr>
                <th class="px-4 py-3">Nome</th>
                <th class="px-4 py-3">Tipo</th>
                <th class="px-4 py-3">Fechamento</th>
                <th class="px-4 py-3">Vencimento</th>
                <th class="px-4 py-3">Situação</th>
                <th class="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (account of visible(); track account.id) {
                <tr class="border-t border-gefinc-border">
                  <td class="max-w-72 px-4 py-3"><gef-account-badge [account]="account" [showBank]="true" /></td>
                  <td class="px-4 py-3">{{ labels[account.type] }}</td>
                  <td class="px-4 py-3">{{ account.closingDay ? 'dia ' + account.closingDay : '—' }}</td>
                  <td class="px-4 py-3">{{ account.dueDay ? 'dia ' + account.dueDay : '—' }}</td>
                  <td class="px-4 py-3">
                    @if (account.active) {
                      <span class="text-gefinc-primary">Ativa</span>
                    } @else {
                      <span class="text-gefinc-muted">Inativa</span>
                    }
                  </td>
                  <td class="px-4 py-3"><div class="flex flex-wrap justify-end gap-2">
                    <button type="button" class="gef-btn-sm" (click)="startEdit(account)">Editar</button>
                    <button type="button" class="gef-btn-sm" (click)="toggleActive(account)">
                      {{ account.active ? 'Inativar' : 'Reativar' }}
                    </button>
                    <button type="button" class="gef-btn-sm gef-btn-sm-danger" (click)="remove(account)">Excluir</button>
                  </div></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
    <gef-sheet heading="Inativar conta com cartões" [open]="!!confirming()" (closed)="confirming.set(null)">
      @if (confirming(); as bank) {
        <p class="mb-2 text-body-base">
          {{ bank.name }} tem {{ cardsOf(bank).length === 1 ? 'um cartão vinculado' : cardsOf(bank).length + ' cartões vinculados' }}:
          <strong>{{ cardNames(bank) }}</strong>.
        </p>
        <p class="mb-4 text-body-base text-gefinc-muted">
          Os cartões continuam funcionando e o histórico é preservado, mas esta conta deixa de ser oferecida para novos cartões.
        </p>
        <div class="flex flex-col gap-3">
          <button type="button" class="gef-btn-secondary" (click)="confirming.set(null)">Voltar</button>
          <button type="button" class="gef-btn-danger" (click)="confirmInactivate()">Inativar mesmo assim</button>
        </div>
      }
    </gef-sheet>
  `,
})
export class AccountsPage implements OnInit {
  private readonly api = inject(AccountsApi);
  private readonly notices = inject(NoticeService);
  protected readonly viewport = inject(Viewport);

  protected readonly labels = ACCOUNT_TYPE_LABELS;
  protected readonly accounts = signal<Account[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly showInactive = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Account | null>(null);
  protected readonly formKey = signal(0);
  protected readonly confirming = signal<Account | null>(null);
  protected readonly holderFilter = signal<HolderType | 'ALL'>('ALL');
  protected readonly holderFilters: { value: HolderType | 'ALL'; label: string }[] = [
    { value: 'ALL', label: 'Todas' },
    { value: 'PF', label: HOLDER_LABELS.PF },
    { value: 'PJ', label: HOLDER_LABELS.PJ },
  ];

  /** Contas bancárias que um cartão pode usar. */
  protected readonly banks = computed(() => this.accounts().filter((a) => a.type === 'CHECKING'));
  /** O filtro PF/PJ só aparece quando há os dois tipos de titular (FR-004). */
  protected readonly showHolderFilter = computed(() => {
    const holders = new Set(this.accounts().map((a) => a.holderType).filter(Boolean));
    return holders.size > 1;
  });
  protected readonly visible = computed(() => {
    const filter = this.holderFilter();
    return filter === 'ALL' || !this.showHolderFilter()
      ? this.accounts()
      : this.accounts().filter((a) => a.holderType === filter);
  });

  constructor() {
    // Conflito de edição entre dispositivos: recarrega a lista com a versão mais recente.
    effect(() => {
      if (this.notices.staleVersionCount() > 0) {
        untracked(() => this.load());
      }
    });
  }

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.list(this.showInactive()).subscribe({
      next: (list) => {
        this.accounts.set(list);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.loadError.set(messageFor(toProblem(e)));
        this.loading.set(false);
      },
    });
  }

  protected toggleInactive(event: Event): void {
    this.showInactive.set((event.target as HTMLInputElement).checked);
    this.load();
  }

  protected startCreate(): void {
    this.editing.set(null);
    this.formKey.update((k) => k + 1);
    this.formOpen.set(true);
  }

  /** Atalho do formulário de cartão sem conta bancária: recomeça o formulário como conta bancária. */
  protected newBank(): void {
    this.startCreate();
  }

  protected startEdit(account: Account): void {
    this.editing.set(account);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected onSaved(): void {
    const created = !this.editing();
    this.closeForm();
    this.load();
    this.notices.toast(created ? 'Conta cadastrada.' : 'Conta atualizada.');
  }

  protected cardsOf(bank: Account): Account[] {
    return this.accounts().filter((a) => a.bankAccountId === bank.id);
  }

  protected cardNames(bank: Account): string {
    return this.cardsOf(bank)
      .map((c) => c.name)
      .join(', ');
  }

  protected toggleActive(account: Account): void {
    this.message.set(null);
    if (account.active && this.cardsOf(account).length > 0) {
      this.confirming.set(account);
      return;
    }
    this.sendActive(account);
  }

  protected confirmInactivate(): void {
    const bank = this.confirming();
    this.confirming.set(null);
    if (bank) {
      this.sendActive(bank);
    }
  }

  private sendActive(account: Account): void {
    this.api
      .update(account.id, {
        name: account.name,
        type: account.type,
        closingDay: account.closingDay,
        dueDay: account.dueDay,
        ...(account.type === 'CHECKING' && account.holderType ? { holderType: account.holderType } : {}),
        ...(account.icon ? { icon: account.icon } : {}),
        ...(account.type === 'CREDIT_CARD' && account.bankAccountId ? { bankAccountId: account.bankAccountId } : {}),
        active: !account.active,
        version: account.version,
      })
      .subscribe({
        next: (updated) => {
          this.load();
          this.notices.toast(account.active ? 'Conta inativada.' : 'Conta reativada.', {
            undo: () => this.sendActive({ ...account, active: !account.active, version: updated.version }),
          });
        },
        error: (e: unknown) => this.message.set(messageFor(toProblem(e))),
      });
  }

  protected remove(account: Account): void {
    this.message.set(null);
    this.api.remove(account.id).subscribe({
      next: () => {
        this.load();
        this.notices.toast('Conta excluída.');
      },
      error: (e: unknown) => this.message.set(messageFor(toProblem(e))),
    });
  }
}
