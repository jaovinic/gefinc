import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PendingEmailChange } from '@gefinc/core-models';
import { ConfirmDialog, Icon } from '@gefinc/ui-shared';

let nextId = 0;

/**
 * Diálogo de troca de e-mail administrativa com prova de posse (dois passos):
 * 1. Solicitação do novo endereço (envia código de 6 dígitos ao novo titular).
 * 2. Confirmação do código digitado pelo administrador com feedback de tentativas e cancelamento.
 */
@Component({
  selector: 'gef-email-change-dialog',
  imports: [ConfirmDialog, FormsModule, Icon],
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
      tone="primary"
      (confirmed)="onConfirm()"
      (cancelled)="onCancel()"
    >
      <p class="text-body-base" data-testid="dialog-effect">{{ effect() }}</p>

      @if (!isConfirmStep()) {
        <div class="mt-3">
          <label class="gef-label" [attr.for]="emailInputId">Novo endereço de e-mail</label>
          <input
            class="gef-input"
            type="email"
            autocomplete="off"
            placeholder="usuario@dominio.com"
            data-testid="email-input"
            [id]="emailInputId"
            [attr.aria-invalid]="emailError() ? 'true' : null"
            [attr.aria-describedby]="emailError() ? emailErrorId : null"
            [value]="newEmail()"
            (input)="onEmailInput($event)"
          />
          @if (emailError()) {
            <p class="gef-field-error" [id]="emailErrorId" data-testid="email-error">{{ emailError() }}</p>
          }
        </div>
      } @else {
        <div class="mt-3 space-y-3">
          <div class="rounded border border-gefinc-border p-3 text-caption text-gefinc-muted" data-testid="pending-info">
            <p>Novo e-mail: <strong class="text-gefinc-text">{{ pending()?.newEmail }}</strong></p>
            <p>Tentativas restantes: <strong class="text-gefinc-text">{{ pending()?.attemptsLeft ?? 5 }}</strong> de 5</p>
          </div>

          <div>
            <label class="gef-label" [attr.for]="codeInputId">Código de confirmação (6 dígitos)</label>
            <input
              class="gef-input font-mono tracking-widest text-center"
              type="text"
              inputmode="numeric"
              maxlength="6"
              placeholder="000000"
              autocomplete="one-time-code"
              data-testid="code-input"
              [id]="codeInputId"
              [attr.aria-invalid]="codeError() ? 'true' : null"
              [attr.aria-describedby]="codeError() ? codeErrorId : null"
              [value]="code()"
              (input)="onCodeInput($event)"
            />
            @if (codeError()) {
              <p class="gef-field-error" [id]="codeErrorId" data-testid="code-error">{{ codeError() }}</p>
            }
          </div>

          <div class="pt-1">
            <button
              type="button"
              class="text-caption text-gefinc-danger underline-offset-2 hover:underline"
              data-testid="cancel-pending-btn"
              [disabled]="busy()"
              (click)="cancelPending.emit()"
            >
              Cancelar pedido de troca pendente
            </button>
          </div>
        </div>
      }
    </gef-confirm-dialog>
  `,
})
export class EmailChangeDialog {
  readonly open = input.required<boolean>();
  readonly pending = input<PendingEmailChange | null>(null);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly requestSubmitted = output<string>();
  readonly confirmSubmitted = output<string>();
  readonly cancelPending = output<void>();
  readonly cancelled = output<void>();

  protected readonly newEmail = signal('');
  protected readonly code = signal('');
  protected readonly emailError = signal<string | null>(null);
  protected readonly codeError = signal<string | null>(null);

  protected readonly isConfirmStep = computed(() => this.pending() !== null);
  protected readonly heading = computed(() =>
    this.isConfirmStep() ? 'Confirmar troca de e-mail' : 'Trocar e-mail do usuário',
  );
  protected readonly effect = computed(() =>
    this.isConfirmStep()
      ? 'Digite o código de 6 dígitos informado pelo titular do novo e-mail. Ao confirmar, todas as sessões e tokens de renovação anteriores da conta serão encerrados e avisos serão enviados para os dois endereços.'
      : 'Informe o novo endereço de e-mail. Um código numérico de 6 dígitos válido por 15 minutos será enviado ao novo endereço. O e-mail atual do usuário continua válido até a confirmação.',
  );
  protected readonly confirmLabel = computed(() =>
    this.isConfirmStep() ? 'Confirmar troca de e-mail' : 'Enviar código de confirmação',
  );
  protected readonly confirmIcon = computed(() => (this.isConfirmStep() ? 'check' : 'mail'));
  protected readonly busyLabel = computed(() =>
    this.isConfirmStep() ? 'Confirmando…' : 'Enviando código…',
  );

  private readonly id = nextId++;
  protected readonly emailInputId = `gef-email-change-input-${this.id}`;
  protected readonly emailErrorId = `gef-email-change-err-${this.id}`;
  protected readonly codeInputId = `gef-email-change-code-${this.id}`;
  protected readonly codeErrorId = `gef-email-change-code-err-${this.id}`;

  constructor() {
    effect(() => {
      if (!this.open()) {
        this.newEmail.set('');
        this.code.set('');
        this.emailError.set(null);
        this.codeError.set(null);
      }
    });
  }

  protected onEmailInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.newEmail.set(value);
    if (this.emailError()) {
      this.emailError.set(null);
    }
  }

  protected onCodeInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6);
    this.code.set(value);
    if (this.codeError()) {
      this.codeError.set(null);
    }
  }

  protected onConfirm(): void {
    if (this.isConfirmStep()) {
      const codeVal = this.code().trim();
      if (!/^\d{6}$/.test(codeVal)) {
        this.codeError.set('Informe o código de 6 dígitos numéricos.');
        return;
      }
      this.codeError.set(null);
      this.confirmSubmitted.emit(codeVal);
    } else {
      const emailVal = this.newEmail().trim();
      if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        this.emailError.set('Informe um endereço de e-mail válido.');
        return;
      }
      this.emailError.set(null);
      this.requestSubmitted.emit(emailVal);
    }
  }

  protected onCancel(): void {
    this.newEmail.set('');
    this.code.set('');
    this.emailError.set(null);
    this.codeError.set(null);
    this.cancelled.emit();
  }
}
