import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { ConfirmDialog } from '@gefinc/ui-shared';

/** Limite do motivo informado pelo administrador (igual ao do contrato e da auditoria). */
export const REASON_MAX_LENGTH = 500;

/** O que o administrador informou ao confirmar; só os campos que o diálogo pediu. */
export interface ActionDialogResult {
  reason?: string;
  password?: string;
}

let nextId = 0;

/**
 * Diálogo de confirmação de uma ação administrativa, reutilizável por todas as ações do painel. Sempre
 * mostra, em texto, o efeito da ação antes de confirmar; pede motivo (1 a 500 caracteres, com contador)
 * e/ou a senha do administrador conforme a ação; e mantém o erro da tentativa dentro do diálogo, sem
 * fechá-lo. Reutiliza o `gef-confirm-dialog` (foco inicial em "Cancelar", Escape e fundo cancelam, foco
 * devolvido a quem abriu). Os campos voltam vazios a cada abertura: a senha nunca fica guardada.
 */
@Component({
  selector: 'gef-action-dialog',
  imports: [ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gef-confirm-dialog
      [open]="open()"
      [heading]="heading()"
      [confirmLabel]="confirmLabel()"
      [confirmIcon]="confirmIcon()"
      [busyLabel]="busyLabel()"
      [busy]="busy()"
      [error]="error()"
      [tone]="tone()"
      (confirmed)="onConfirm()"
      (cancelled)="cancelled.emit()"
    >
      <p data-testid="action-effect">{{ effect() }}</p>

      @if (requireReason()) {
        <div class="mt-3">
          <label class="gef-label" [attr.for]="reasonId">Motivo</label>
          <textarea
            class="gef-input"
            rows="3"
            data-testid="action-reason"
            [id]="reasonId"
            [attr.maxlength]="reasonMax"
            [attr.aria-invalid]="reasonInvalid() ? 'true' : null"
            [attr.aria-describedby]="reasonInvalid() ? reasonCounterId + ' ' + reasonErrorId : reasonCounterId"
            [value]="reason()"
            (input)="onReason($event)"
          ></textarea>
          <p class="mt-1 text-right text-caption text-gefinc-muted" [id]="reasonCounterId" data-testid="reason-counter">{{ reason().length }}/{{ reasonMax }}</p>
          @if (reasonInvalid()) {
            <p class="gef-field-error" [id]="reasonErrorId" data-testid="reason-error">Informe o motivo (de 1 a {{ reasonMax }} caracteres).</p>
          }
        </div>
      }

      @if (requirePassword()) {
        <div class="mt-3">
          <label class="gef-label" [attr.for]="passwordId">Sua senha, para confirmar</label>
          <input
            class="gef-input"
            type="password"
            autocomplete="current-password"
            data-testid="action-password"
            [id]="passwordId"
            [attr.aria-invalid]="passwordInvalid() ? 'true' : null"
            [attr.aria-describedby]="passwordInvalid() ? passwordErrorId : null"
            [value]="password()"
            (input)="onPassword($event)"
          />
          @if (passwordInvalid()) {
            <p class="gef-field-error" [id]="passwordErrorId" data-testid="password-error">Informe sua senha.</p>
          }
        </div>
      }
    </gef-confirm-dialog>
  `,
})
export class ActionDialog {
  readonly open = input.required<boolean>();
  readonly heading = input.required<string>();
  /** O efeito da ação em texto, sempre visível antes de confirmar. */
  readonly effect = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly confirmIcon = input<string | null>(null);
  readonly busyLabel = input('Aplicando…');
  readonly requireReason = input(false);
  readonly requirePassword = input(false);
  readonly tone = input<'danger' | 'primary'>('danger');
  readonly busy = input(false);
  /** Falha da tentativa: aparece dentro do diálogo, que continua aberto. */
  readonly error = input<string | null>(null);

  readonly confirmed = output<ActionDialogResult>();
  readonly cancelled = output<void>();

  private readonly id = nextId++;
  protected readonly reasonId = `action-reason-${this.id}`;
  protected readonly reasonCounterId = `action-reason-counter-${this.id}`;
  protected readonly reasonErrorId = `action-reason-error-${this.id}`;
  protected readonly passwordId = `action-password-${this.id}`;
  protected readonly passwordErrorId = `action-password-error-${this.id}`;
  protected readonly reasonMax = REASON_MAX_LENGTH;

  protected readonly reason = signal('');
  protected readonly password = signal('');
  private readonly attempted = signal(false);

  protected reasonInvalid(): boolean {
    return this.attempted() && this.requireReason() && this.reason().trim().length === 0;
  }

  protected passwordInvalid(): boolean {
    return this.attempted() && this.requirePassword() && this.password().length === 0;
  }

  constructor() {
    // Fechado: esquece tudo (a senha nunca fica guardada); reaberto, os campos voltam vazios.
    effect(() => {
      if (!this.open()) {
        this.reason.set('');
        this.password.set('');
        this.attempted.set(false);
      }
    });
    // Senha recusada: limpa o campo para digitar de novo e mantém o motivo já escrito.
    effect(() => {
      if (this.error()) {
        this.password.set('');
      }
    });
  }

  protected onReason(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  protected onPassword(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  protected onConfirm(): void {
    this.attempted.set(true);
    if (this.reasonInvalid() || this.passwordInvalid()) {
      return;
    }
    const result: ActionDialogResult = {};
    if (this.requireReason()) {
      result.reason = this.reason().trim();
    }
    if (this.requirePassword()) {
      result.password = this.password();
    }
    this.confirmed.emit(result);
  }
}
