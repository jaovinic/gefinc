import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ErrorView, Icon, LoadingView, NoticeService, Sheet, isOfflineProblem, messageFor, toProblem } from '@gefinc/ui-shared';
import { AdminApi, type DeletionReason, type DeletionReasonInput } from '../admin.api';

export const REASON_NAME_MAX = 60;
export const REASON_MESSAGE_MAX = 500;

/**
 * Gestão dos motivos de exclusão de usuários (US11).
 *
 * Permite cadastrar novos motivos, editar mensagens genéricas e desativar/reativar motivos.
 * Preserva o histórico de motivos existentes: motivos nunca são removidos fisicamente (não há DELETE).
 * Os 4 motivos padrão do sistema são identificados com badge 'Inicial'.
 */
@Component({
  selector: 'gef-admin-reasons-page',
  imports: [ErrorView, Icon, LoadingView, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4" data-testid="reasons-page">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 class="text-title-md font-bold">Motivos de exclusão</h2>
          <p class="text-body-base text-gefinc-muted">
            Motivos oferecidos na exclusão de contas e mensagens genéricas comunicadas aos usuários.
          </p>
        </div>
        <button
          type="button"
          class="gef-btn-primary gef-btn-inline"
          data-testid="create-reason-btn"
          (click)="openCreateModal()"
        >
          <gef-icon name="plus" [size]="16" />
          Novo motivo
        </button>
      </header>

      @if (loading()) {
        <gef-loading variant="list" message="Carregando motivos de exclusão…" />
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" [variant]="loadOffline() ? 'offline' : 'error'" (retry)="load()" />
      } @else {
        <div class="gef-table-wrap">
          <table class="gef-table">
            <caption class="sr-only">Motivos de exclusão de contas</caption>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Mensagem genérica comunicada ao usuário</th>
                <th scope="col">Situação</th>
                <th scope="col" class="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (reason of reasons(); track reason.id) {
                <tr data-testid="reason-row">
                  <td class="font-medium">
                    <div class="flex flex-wrap items-center gap-2">
                      <span data-testid="reason-name">{{ reason.name }}</span>
                      @if (reason.initial) {
                        <span class="gef-badge border-gefinc-primary/40 text-gefinc-primary" data-testid="reason-badge-initial">
                          Inicial
                        </span>
                      }
                    </div>
                  </td>
                  <td class="text-caption text-gefinc-text" data-testid="reason-message">
                    {{ reason.message }}
                  </td>
                  <td data-testid="reason-status">
                    @if (reason.active) {
                      <span class="inline-flex items-center gap-1 text-caption font-semibold text-gefinc-primary">
                        <gef-icon name="check" [size]="14" />
                        Ativo
                      </span>
                    } @else {
                      <span class="inline-flex items-center gap-1 text-caption font-semibold text-gefinc-muted">
                        Inativo
                      </span>
                    }
                  </td>
                  <td class="text-right">
                    <div class="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        class="gef-btn-sm gap-1.5"
                        data-testid="edit-reason-btn"
                        (click)="openEditModal(reason)"
                      >
                        <gef-icon name="edit" [size]="14" />
                        Editar
                      </button>
                      @if (reason.active) {
                        <button
                          type="button"
                          class="gef-btn-sm gef-btn-sm-danger"
                          data-testid="deactivate-reason-btn"
                          [disabled]="actionBusyId() === reason.id"
                          (click)="toggleActive(reason)"
                        >
                          Desativar
                        </button>
                      } @else {
                        <button
                          type="button"
                          class="gef-btn-sm gef-btn-sm-primary"
                          data-testid="activate-reason-btn"
                          [disabled]="actionBusyId() === reason.id"
                          (click)="toggleActive(reason)"
                        >
                          Reativar
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    <gef-sheet
      [heading]="editingReason() ? 'Editar motivo de exclusão' : 'Novo motivo de exclusão'"
      [open]="modalOpen()"
      [dismissible]="!formBusy()"
      initialFocus="#reason-name-input"
      (closed)="closeModal()"
    >
      @if (modalOpen()) {
        <div class="space-y-4" data-testid="reason-modal">
          <p class="text-caption text-gefinc-muted">
            A mensagem genérica será comunicada ao usuário nos avisos de exclusão por e-mail e na tela de login.
            Ela NÃO pode conter dados pessoais, e-mails, URLs ou marcadores de template.
          </p>

          @if (formError(); as err) {
            <p class="gef-alert-error" role="alert" data-testid="form-error">{{ err }}</p>
          }

          <!-- Campo Nome -->
          <div>
            <div class="mb-1 flex items-baseline justify-between">
              <label class="gef-label" for="reason-name-input">Nome do motivo</label>
              <span class="text-caption text-gefinc-muted">{{ formName().length }}/{{ maxName }}</span>
            </div>
            <input
              id="reason-name-input"
              class="gef-input"
              type="text"
              [attr.maxlength]="maxName"
              [value]="formName()"
              (input)="onNameInput($event)"
              data-testid="input-reason-name"
              placeholder="Ex.: Término de contrato comercial"
            />
            @if (fieldNameError()) {
              <p class="gef-field-error" data-testid="field-name-error">{{ fieldNameError() }}</p>
            }
          </div>

          <!-- Campo Mensagem Genérica -->
          <div>
            <div class="mb-1 flex items-baseline justify-between">
              <label class="gef-label" for="reason-message-input">Mensagem genérica para o usuário</label>
              <span class="text-caption text-gefinc-muted">{{ formMessage().length }}/{{ maxMessage }}</span>
            </div>
            <textarea
              id="reason-message-input"
              class="gef-input"
              rows="4"
              [attr.maxlength]="maxMessage"
              [value]="formMessage()"
              (input)="onMessageInput($event)"
              data-testid="input-reason-message"
              placeholder="Ex.: Sua conta foi programada para exclusão devido ao encerramento do contrato de serviço."
            ></textarea>
            @if (fieldMessageError()) {
              <p class="gef-field-error" data-testid="field-message-error">{{ fieldMessageError() }}</p>
            }
          </div>

          <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              class="gef-btn-secondary gef-btn-inline"
              (click)="closeModal()"
              [disabled]="formBusy()"
              data-testid="modal-cancel-btn"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="gef-btn-primary gef-btn-inline"
              (click)="saveModal()"
              [disabled]="formBusy()"
              data-testid="modal-save-btn"
            >
              {{ formBusy() ? 'Salvando…' : 'Salvar' }}
            </button>
          </div>
        </div>
      }
    </gef-sheet>
  `,
})
export class ReasonsPage implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly notices = inject(NoticeService);

  readonly maxName = REASON_NAME_MAX;
  readonly maxMessage = REASON_MESSAGE_MAX;

  protected readonly reasons = signal<readonly DeletionReason[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loadOffline = signal(false);
  protected readonly actionBusyId = signal<number | null>(null);

  protected readonly modalOpen = signal(false);
  protected readonly editingReason = signal<DeletionReason | null>(null);
  protected readonly formName = signal('');
  protected readonly formMessage = signal('');
  protected readonly formBusy = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly fieldNameError = signal<string | null>(null);
  protected readonly fieldMessageError = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.listDeletionReasons().subscribe({
      next: (list) => {
        this.reasons.set(list);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.loading.set(false);
        this.loadOffline.set(isOfflineProblem(problem));
        this.loadError.set(messageFor(problem));
      },
    });
  }

  openCreateModal(): void {
    this.editingReason.set(null);
    this.formName.set('');
    this.formMessage.set('');
    this.clearModalErrors();
    this.modalOpen.set(true);
  }

  openEditModal(reason: DeletionReason): void {
    this.editingReason.set(reason);
    this.formName.set(reason.name);
    this.formMessage.set(reason.message);
    this.clearModalErrors();
    this.modalOpen.set(true);
  }

  closeModal(): void {
    if (!this.formBusy()) {
      this.modalOpen.set(false);
      this.clearModalErrors();
    }
  }

  private clearModalErrors(): void {
    this.formError.set(null);
    this.fieldNameError.set(null);
    this.fieldMessageError.set(null);
  }

  onNameInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.formName.set(val);
    this.fieldNameError.set(null);
  }

  onMessageInput(event: Event): void {
    const val = (event.target as HTMLTextAreaElement).value;
    this.formMessage.set(val);
    this.fieldMessageError.set(null);
  }

  saveModal(): void {
    if (this.formBusy()) return;

    this.clearModalErrors();
    const name = this.formName().trim();
    const message = this.formMessage().trim();
    let hasErr = false;

    if (!name) {
      this.fieldNameError.set('O nome do motivo é obrigatório.');
      hasErr = true;
    } else if (name.length > REASON_NAME_MAX) {
      this.fieldNameError.set(`O nome deve ter no máximo ${REASON_NAME_MAX} caracteres.`);
      hasErr = true;
    }

    if (!message) {
      this.fieldMessageError.set('A mensagem genérica é obrigatória.');
      hasErr = true;
    } else if (message.length > REASON_MESSAGE_MAX) {
      this.fieldMessageError.set(`A mensagem deve ter no máximo ${REASON_MESSAGE_MAX} caracteres.`);
      hasErr = true;
    }

    if (hasErr) return;

    this.formBusy.set(true);
    const input: DeletionReasonInput = { name, message };
    const editing = this.editingReason();

    const request$ = editing
      ? this.api.updateDeletionReason(editing.id, input)
      : this.api.createDeletionReason(input);

    request$.subscribe({
      next: () => {
        this.formBusy.set(false);
        this.modalOpen.set(false);
        const toastMsg = editing ? 'Motivo de exclusão atualizado.' : 'Motivo de exclusão criado com sucesso.';
        this.notices.toast(toastMsg);
        this.load();
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.formBusy.set(false);
        if (problem.fieldErrors && Object.keys(problem.fieldErrors).length > 0) {
          if (problem.fieldErrors['name']) this.fieldNameError.set(problem.fieldErrors['name']);
          if (problem.fieldErrors['message']) this.fieldMessageError.set(problem.fieldErrors['message']);
        } else {
          this.formError.set(messageFor(problem));
        }
      },
    });
  }

  toggleActive(reason: DeletionReason): void {
    if (this.actionBusyId() !== null) return;
    this.actionBusyId.set(reason.id);

    const call$ = reason.active
      ? this.api.deactivateDeletionReason(reason.id)
      : this.api.activateDeletionReason(reason.id);

    const successMsg = reason.active
      ? 'Motivo de exclusão desativado.'
      : 'Motivo de exclusão reativado com sucesso.';

    call$.subscribe({
      next: () => {
        this.actionBusyId.set(null);
        this.notices.toast(successMsg);
        this.load();
      },
      error: (error: unknown) => {
        this.actionBusyId.set(null);
        this.notices.toast(messageFor(toProblem(error)));
      },
    });
  }
}
