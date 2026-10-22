import { Component, OnInit, effect, inject, signal, untracked } from '@angular/core';
import type { Account } from '@gefinc/core-models';
import { AccountsApi, NoticeService, messageFor, toProblem } from '../api';
import { EmptyView, ErrorView, LoadingView } from '../state-views/state-views';
import { Viewport } from '../viewport/viewport';
import { ACCOUNT_TYPE_LABELS, AccountForm } from './account-form';

/** Cadastro de contas bancárias, dinheiro e cartões de crédito (FR-011 a FR-013). */
@Component({
  selector: 'gef-accounts-page',
  imports: [AccountForm, EmptyView, ErrorView, LoadingView],
  template: `
    <section class="space-y-4">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-title-lg font-bold">Contas e cartões</h1>
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-body-base text-gefinc-muted">
            <input type="checkbox" [checked]="showInactive()" (change)="toggleInactive($event)" />
            Mostrar inativas
          </label>
          <button type="button" class="gef-btn-secondary" (click)="startCreate()">Nova conta</button>
        </div>
      </header>

      @if (message(); as text) {
        <p class="gef-alert-error" role="alert">{{ text }}</p>
      }

      @if (formOpen()) {
        <gef-account-form [account]="editing()" (saved)="onSaved()" (cancelled)="closeForm()" />
      }

      @if (loading()) {
        <gef-loading message="Carregando contas…" />
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" (retry)="load()" />
      } @else if (accounts().length === 0) {
        <gef-empty title="Nenhuma conta cadastrada" hint="Cadastre uma conta, o dinheiro em espécie ou um cartão de crédito para começar.">
          <button type="button" class="gef-btn-secondary" (click)="startCreate()">Nova conta</button>
        </gef-empty>
      } @else if (viewport.compact()) {
        <ul class="space-y-3">
          @for (account of accounts(); track account.id) {
            <li data-testid="account-card" class="rounded-xl border border-gefinc-border bg-gefinc-surface p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-semibold">{{ account.name }}</p>
                  <p class="text-caption text-gefinc-muted">
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
              <div class="mt-2 flex flex-wrap gap-1 border-t border-gefinc-border pt-2">
                <button type="button" class="gef-link gef-action" [attr.aria-label]="'Editar ' + account.name" (click)="startEdit(account)">Editar</button>
                <button type="button" class="gef-link gef-action" [attr.aria-label]="(account.active ? 'Inativar ' : 'Reativar ') + account.name" (click)="toggleActive(account)">
                  {{ account.active ? 'Inativar' : 'Reativar' }}
                </button>
                <button type="button" class="gef-action text-gefinc-danger" [attr.aria-label]="'Excluir ' + account.name" (click)="remove(account)">Excluir</button>
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
              @for (account of accounts(); track account.id) {
                <tr class="border-t border-gefinc-border">
                  <td class="px-4 py-3 font-medium">{{ account.name }}</td>
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
                  <td class="space-x-2 px-4 py-3 text-right">
                    <button type="button" class="gef-link" (click)="startEdit(account)">Editar</button>
                    <button type="button" class="gef-link" (click)="toggleActive(account)">
                      {{ account.active ? 'Inativar' : 'Reativar' }}
                    </button>
                    <button type="button" class="text-gefinc-danger hover:underline" (click)="remove(account)">Excluir</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
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
    this.formOpen.set(true);
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
    this.closeForm();
    this.load();
  }

  protected toggleActive(account: Account): void {
    this.message.set(null);
    this.api
      .update(account.id, {
        name: account.name,
        type: account.type,
        closingDay: account.closingDay,
        dueDay: account.dueDay,
        active: !account.active,
        version: account.version,
      })
      .subscribe({
        next: () => this.load(),
        error: (e: unknown) => this.message.set(messageFor(toProblem(e))),
      });
  }

  protected remove(account: Account): void {
    this.message.set(null);
    this.api.remove(account.id).subscribe({
      next: () => this.load(),
      error: (e: unknown) => this.message.set(messageFor(toProblem(e))),
    });
  }
}
