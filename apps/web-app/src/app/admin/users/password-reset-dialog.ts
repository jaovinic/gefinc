import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ActionDialog, type ActionDialogResult } from './action-dialog';

export type PasswordResetMode = 'send' | 'force';

interface ResetModeConfig {
  heading: string;
  effect: string;
  confirmIcon: string;
  tone: 'primary' | 'danger';
  requirePassword: boolean;
  busyLabel: string;
}

const MODE_CONFIGS: Record<PasswordResetMode, ResetModeConfig> = {
  send: {
    heading: 'Reenviar e-mail de redefinição',
    effect:
      'Um novo link de redefinição de senha será enviado para o e-mail desta conta e os links anteriores deixarão de valer. A senha atual e as sessões abertas continuam valendo até o usuário definir uma nova senha. Você nunca verá a senha nem o link.',
    confirmIcon: 'mail',
    tone: 'primary',
    requirePassword: false,
    busyLabel: 'Enviando…',
  },
  force: {
    heading: 'Forçar redefinição de senha',
    effect:
      'A senha atual e todas as sessões abertas desta conta deixam de valer imediatamente, e o usuário só voltará a entrar depois de criar uma nova senha pelo link enviado por e-mail. Se o envio do e-mail falhar, nada será alterado. Confirme com a sua senha.',
    confirmIcon: 'alert',
    tone: 'danger',
    requirePassword: true,
    busyLabel: 'Forçando…',
  },
};

/**
 * Diálogo de confirmação das duas ações administrativas de redefinição de senha (`send` = reenviar
 * link; `force` = invalidar senha e sessões e enviar novo link). Mostra sempre o efeito da ação em
 * texto antes de confirmar, exige a senha do administrador apenas na ação forçada e exibe falhas
 * (como `502 MAIL_DELIVERY_FAILED` ou `403 REAUTH_FAILED`) dentro do próprio diálogo sem fechá-lo.
 */
@Component({
  selector: 'gef-password-reset-dialog',
  imports: [ActionDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gef-action-dialog
      [open]="open()"
      [heading]="config().heading"
      [effect]="config().effect"
      [confirmLabel]="config().heading"
      [confirmIcon]="config().confirmIcon"
      [busyLabel]="config().busyLabel"
      [requireReason]="false"
      [requirePassword]="config().requirePassword"
      [tone]="config().tone"
      [busy]="busy()"
      [error]="error()"
      (confirmed)="onConfirmed($event)"
      (cancelled)="cancelled.emit()"
    />
  `,
})
export class PasswordResetDialog {
  readonly open = input.required<boolean>();
  readonly mode = input<PasswordResetMode>('send');
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly confirmed = output<{ password?: string }>();
  readonly cancelled = output<void>();

  protected readonly config = computed(() => MODE_CONFIGS[this.mode()]);

  protected onConfirmed(result: ActionDialogResult): void {
    this.confirmed.emit(result.password !== undefined ? { password: result.password } : {});
  }
}
