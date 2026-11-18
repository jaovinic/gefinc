import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmDialog, Select, type SelectOption } from '@gefinc/ui-shared';
import type { DeletionReason, DeletionRequestInput } from '../admin.api';

export const DELETION_JUSTIFICATION_MAX = 1000;

let nextId = 0;

/**
 * Diálogo de exclusão administrativa de conta (US10).
 *
 * Exige:
 * 1. Seleção de um motivo ativo cadastrado.
 * 2. Justificativa em texto livre (1 a 1000 caracteres), com aviso claro de LGPD para NÃO incluir
 *    dados pessoais do titular e informando que fica registrada apenas na auditoria.
 * 3. Escolha do modo: com prazo de carência (1 a 30 dias) ou imediata.
 * 4. Confirmação reforçada: digitação exata do e-mail do usuário alvo e senha do administrador.
 */
@Component({
  selector: 'gef-deletion-dialog',
  imports: [ConfirmDialog, FormsModule, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gef-confirm-dialog
      [open]="open()"
      [heading]="heading()"
      [confirmLabel]="confirmLabel()"
      [confirmIcon]="'trash'"
      [busyLabel]="busyLabel()"
      [busy]="busy()"
      [error]="error()"
      [tone]="'danger'"
      (confirmed)="onConfirm()"
      (cancelled)="cancelled.emit()"
    >
      <div class="space-y-4">
        <p class="text-caption text-gefinc-muted" data-testid="deletion-effect-summary">
          {{ effectText() }}
        </p>

        <!-- Motivo -->
        <div>
          <gef-select
            data-testid="deletion-reason-select"
            label="Motivo da exclusão"
            placeholder="Selecione um motivo…"
            [options]="reasonOptions()"
            [invalid]="!!reasonError()"
            [describedBy]="reasonError() ? reasonErrorId : ''"
            [ngModel]="reasonId()"
            (ngModelChange)="onReasonChange($event)"
          />
          @if (reasonError()) {
            <p class="gef-field-error" [id]="reasonErrorId" data-testid="deletion-reason-error">
              {{ reasonError() }}
            </p>
          }
        </div>

        <!-- Justificativa -->
        <div>
          <div class="mb-1 flex items-baseline justify-between">
            <label class="gef-label" [attr.for]="justificationId">Justificativa</label>
            <span class="text-caption text-gefinc-muted" data-testid="justification-counter">
              {{ justification().length }}/{{ maxJustification }}
            </span>
          </div>

          <!-- Aviso de Privacidade / LGPD -->
          <div
            class="mb-2 rounded-lg border border-gefinc-warning/40 bg-gefinc-warning/10 p-2.5 text-caption text-gefinc-warning"
            role="note"
            data-testid="privacy-notice"
          >
            <p class="font-semibold">Aviso de privacidade e conformidade (LGPD):</p>
            <p>
              NÃO escreva dados pessoais do usuário (nome, e-mail, telefone, CPF etc.) nesta justificativa.
              O texto fica registrado exclusivamente na trilha de auditoria e NÃO é enviado ao usuário.
            </p>
          </div>

          <textarea
            class="gef-input"
            rows="3"
            data-testid="deletion-justification"
            [id]="justificationId"
            [attr.maxlength]="maxJustification"
            [value]="justification()"
            (input)="onJustificationInput($event)"
            [attr.aria-invalid]="justificationError() ? 'true' : null"
            [attr.aria-describedby]="justificationError() ? justificationErrorId : null"
            placeholder="Ex.: Solicitação formal de exclusão de dados pelo titular com base no Art. 18 da LGPD."
          ></textarea>
          @if (justificationError()) {
            <p class="gef-field-error" [id]="justificationErrorId" data-testid="deletion-justification-error">
              {{ justificationError() }}
            </p>
          }
        </div>

        <!-- Modo e Prazo -->
        <fieldset class="space-y-2">
          <legend class="gef-label">Prazo para execução</legend>
          <div class="flex flex-col gap-2 sm:flex-row">
            <label class="gef-segment">
              <input
                type="radio"
                name="deletion-mode"
                value="GRACE"
                [checked]="mode() === 'GRACE'"
                (change)="setMode('GRACE')"
                data-testid="mode-grace"
              />
              <span>Com prazo de carência</span>
            </label>
            <label class="gef-segment" data-tone="danger">
              <input
                type="radio"
                name="deletion-mode"
                value="IMMEDIATE"
                [checked]="mode() === 'IMMEDIATE'"
                (change)="setMode('IMMEDIATE')"
                data-testid="mode-immediate"
              />
              <span>Exclusão imediata</span>
            </label>
          </div>

          @if (mode() === 'GRACE') {
            <div class="mt-2 flex items-center gap-2" data-testid="grace-days-container">
              <label class="text-caption text-gefinc-muted" [attr.for]="daysInputId">Prazo em dias (1 a 30):</label>
              <input
                class="gef-input w-24"
                type="number"
                min="1"
                max="30"
                [id]="daysInputId"
                [value]="days()"
                (input)="onDaysInput($event)"
                data-testid="deletion-days-input"
              />
            </div>
            @if (daysError()) {
              <p class="gef-field-error" data-testid="deletion-days-error">{{ daysError() }}</p>
            }
          }
        </fieldset>

        <!-- Efeito e Alerta -->
        <div
          class="rounded-lg border p-3 text-caption"
          [class]="mode() === 'IMMEDIATE' ? 'border-gefinc-danger/40 bg-gefinc-danger/10 text-gefinc-danger' : 'border-gefinc-border bg-gefinc-surface text-gefinc-text'"
          data-testid="deletion-effect-warning"
        >
          @if (mode() === 'IMMEDIATE') {
            <p class="font-semibold">ATENÇÃO — Efeito imediato e irreversível:</p>
            <p>
              A conta e todos os dados financeiros e sessões serão apagados permanentemente AGORA.
              Esta ação NÃO poderá ser cancelada nem desfeita após a confirmação.
            </p>
          } @else {
            <p class="font-semibold">Efeito da exclusão agendada:</p>
            <p>
              A conta perderá o acesso imediatamente. Ao término do prazo de {{ days() }} dias, os dados
              pessoais e financeiros serão removidos permanentemente. A exclusão poderá ser cancelada por um
              administrador até essa data.
            </p>
          }
        </div>

        <!-- Confirmação do e-mail do alvo -->
        <div>
          <label class="gef-label" [attr.for]="confirmEmailId">
            Para confirmar, digite o e-mail da conta: <strong class="text-gefinc-text">{{ targetEmail() }}</strong>
          </label>
          <input
            class="gef-input"
            type="text"
            autocomplete="off"
            [id]="confirmEmailId"
            [value]="confirmEmail()"
            (input)="onConfirmEmailInput($event)"
            data-testid="deletion-confirm-email"
            [attr.aria-invalid]="emailError() ? 'true' : null"
            [attr.aria-describedby]="emailError() ? emailErrorId : null"
            placeholder="Digite o e-mail exato do usuário"
          />
          @if (emailError()) {
            <p class="gef-field-error" [id]="emailErrorId" data-testid="deletion-email-error">
              {{ emailError() }}
            </p>
          }
        </div>

        <!-- Senha do administrador -->
        <div>
          <label class="gef-label" [attr.for]="passwordId">Sua senha de administrador, para confirmar</label>
          <input
            class="gef-input"
            type="password"
            autocomplete="current-password"
            [id]="passwordId"
            [value]="password()"
            (input)="onPasswordInput($event)"
            data-testid="deletion-password"
            [attr.aria-invalid]="passwordError() ? 'true' : null"
            [attr.aria-describedby]="passwordError() ? passwordErrorId : null"
          />
          @if (passwordError()) {
            <p class="gef-field-error" [id]="passwordErrorId" data-testid="deletion-password-error">
              {{ passwordError() }}
            </p>
          }
        </div>
      </div>
    </gef-confirm-dialog>
  `,
})
export class DeletionDialog {
  private readonly uid = nextId++;
  protected readonly reasonErrorId = `del-reason-err-${this.uid}`;
  protected readonly justificationId = `del-just-${this.uid}`;
  protected readonly justificationErrorId = `del-just-err-${this.uid}`;
  protected readonly daysInputId = `del-days-${this.uid}`;
  protected readonly confirmEmailId = `del-email-${this.uid}`;
  protected readonly emailErrorId = `del-email-err-${this.uid}`;
  protected readonly passwordId = `del-pass-${this.uid}`;
  protected readonly passwordErrorId = `del-pass-err-${this.uid}`;

  readonly maxJustification = DELETION_JUSTIFICATION_MAX;

  readonly open = input.required<boolean>();
  readonly targetEmail = input.required<string>();
  readonly reasons = input<readonly DeletionReason[]>([]);
  readonly currentDueAt = input<string | null>(null);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  private readonly reasonSelect = viewChild(Select);

  readonly confirmed = output<DeletionRequestInput>();
  readonly cancelled = output<void>();

  protected readonly activeReasons = computed(() => this.reasons().filter((r) => r.active));
  protected readonly reasonOptions = computed<SelectOption[]>(() => this.activeReasons().map((r) => ({ value: r.id, label: r.name })));
  protected readonly isAnticipation = computed(() => !!this.currentDueAt());
  protected readonly heading = computed(() =>
    this.isAnticipation() ? 'Antecipar exclusão da conta' : 'Excluir conta de usuário',
  );
  protected readonly confirmLabel = computed(() =>
    this.isAnticipation() ? 'Antecipar exclusão' : 'Excluir conta',
  );
  protected readonly busyLabel = computed(() =>
    this.isAnticipation() ? 'Antecipando…' : 'Excluindo…',
  );
  protected readonly effectText = computed(() =>
    this.isAnticipation()
      ? 'Esta conta já possui exclusão agendada. Você pode antecipar o prazo para uma data anterior ou executar a exclusão imediatamente.'
      : 'A exclusão encerra o acesso da conta e remove os dados cadastrais e financeiros de forma permanente.',
  );

  protected readonly reasonId = signal<number | null>(null);
  protected readonly justification = signal('');
  protected readonly mode = signal<'GRACE' | 'IMMEDIATE'>('GRACE');
  protected readonly days = signal(30);
  protected readonly confirmEmail = signal('');
  protected readonly password = signal('');

  protected readonly reasonError = signal<string | null>(null);
  protected readonly justificationError = signal<string | null>(null);
  protected readonly daysError = signal<string | null>(null);
  protected readonly emailError = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.open()) {
        this.resetFields();
      }
    });
  }

  private resetFields(): void {
    this.reasonId.set(null);
    this.justification.set('');
    this.mode.set('GRACE');
    this.days.set(30);
    this.confirmEmail.set('');
    this.password.set('');
    this.clearErrors();
  }

  private clearErrors(): void {
    this.reasonError.set(null);
    this.justificationError.set(null);
    this.daysError.set(null);
    this.emailError.set(null);
    this.passwordError.set(null);
  }

  protected setMode(m: 'GRACE' | 'IMMEDIATE'): void {
    this.mode.set(m);
  }

  protected onReasonChange(value: string | number | null): void {
    this.reasonId.set(value === null || value === '' ? null : Number(value));
    this.reasonError.set(null);
  }

  protected onJustificationInput(event: Event): void {
    const val = (event.target as HTMLTextAreaElement).value;
    this.justification.set(val);
    this.justificationError.set(null);
  }

  protected onDaysInput(event: Event): void {
    const val = Number((event.target as HTMLInputElement).value);
    this.days.set(val);
    this.daysError.set(null);
  }

  protected onConfirmEmailInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.confirmEmail.set(val);
    this.emailError.set(null);
  }

  protected onPasswordInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.password.set(val);
    this.passwordError.set(null);
  }

  protected onConfirm(): void {
    this.clearErrors();
    let hasError = false;

    const rId = this.reasonId();
    if (!rId) {
      this.reasonError.set('Selecione um motivo para a exclusão.');
      hasError = true;
    }

    const just = this.justification().trim();
    if (!just || just.length < 1 || just.length > DELETION_JUSTIFICATION_MAX) {
      this.justificationError.set(
        `Informe a justificativa da exclusão (de 1 a ${DELETION_JUSTIFICATION_MAX} caracteres).`,
      );
      hasError = true;
    }

    const currentMode = this.mode();
    const d = this.days();
    if (currentMode === 'GRACE') {
      if (!Number.isInteger(d) || d < 1 || d > 30) {
        this.daysError.set('O prazo deve ser entre 1 e 30 dias.');
        hasError = true;
      }
    }

    const typedEmail = this.confirmEmail().trim();
    if (typedEmail !== this.targetEmail()) {
      this.emailError.set('O e-mail digitado deve ser exatamente igual ao do usuário.');
      hasError = true;
    }

    const pass = this.password();
    if (!pass) {
      this.passwordError.set('Informe sua senha de administrador.');
      hasError = true;
    }

    if (hasError || rId === null) {
      if (this.reasonError()) {
        this.reasonSelect()?.focus();
      }
      return;
    }

    this.confirmed.emit({
      reasonId: rId,
      justification: just,
      mode: currentMode,
      days: currentMode === 'GRACE' ? d : undefined,
      confirmEmail: typedEmail,
      password: pass,
    });
  }
}
