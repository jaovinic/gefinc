import { Component, input, output } from '@angular/core';
import { Sheet } from './sheet';

let nextId = 0;

/**
 * Confirmação de ação destrutiva, declarativa: a tela decide quando abrir (`open`) e reage a
 * `confirmed` e `cancelled`. Diálogo de alerta acessível: o foco inicial fica em "Cancelar" (o caminho
 * seguro), Escape e toque no fundo cancelam (desligados enquanto `busy`), e o foco volta a quem abriu.
 *
 * Conteúdo projetado: a descrição (escondida quando `blocked`) e, em `[gefConfirmExtra]`, uma ação
 * alternativa (ex.: "Inativar conta"). Com `blocked`, a ação destrutiva não é oferecida: só "Fechar".
 */
@Component({
  selector: 'gef-confirm-dialog',
  imports: [Sheet],
  template: `
    <gef-sheet [role]="'alertdialog'" [heading]="heading()" [open]="open()" [dismissible]="!busy()" [describedBy]="descriptionId" initialFocus="[data-confirm-cancel]" (closed)="cancelled.emit()">
      <div [id]="descriptionId" class="space-y-2 text-body-base">
        @if (blocked(); as text) {
          <p data-testid="confirm-blocked">{{ text }}</p>
        } @else {
          <ng-content />
        }
      </div>
      @if (error(); as text) {
        <p class="gef-alert-error mt-3" role="alert" data-testid="confirm-error">{{ text }}</p>
      }
      <div class="mt-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:justify-end">
        <button type="button" class="gef-btn-secondary min-h-11 whitespace-normal text-center md:min-h-11" data-confirm-cancel data-testid="confirm-cancel" [disabled]="busy()" (click)="cancelled.emit()">
          {{ blocked() ? 'Fechar' : cancelLabel() }}
        </button>
        <ng-content select="[gefConfirmExtra]" />
        @if (!blocked()) {
          <button
            type="button"
            class="min-h-11 whitespace-normal text-center md:min-h-11 md:w-auto"
            [class]="tone() === 'danger' ? 'gef-btn-danger' : 'gef-btn-primary'"
            data-testid="confirm-confirm"
            [disabled]="busy()"
            (click)="onConfirm()"
          >
            {{ busy() ? busyLabel() : confirmLabel() }}
          </button>
        }
      </div>
    </gef-sheet>
  `,
})
export class ConfirmDialog {
  readonly open = input.required<boolean>();
  readonly heading = input.required<string>();
  /** Rótulo do botão que executa a ação, com o alvo (ex.: `Excluir conta "Nubank"`). */
  readonly confirmLabel = input.required<string>();
  readonly cancelLabel = input('Cancelar');
  /** Ação em andamento: trava os botões, o Escape e o fundo, e troca o texto do botão. */
  readonly busy = input(false);
  /** Texto do botão destrutivo enquanto `busy`. */
  readonly busyLabel = input('Excluindo…');
  /** Falha da tentativa: aparece dentro do diálogo, sem fechá-lo. */
  readonly error = input<string | null>(null);
  /** Motivo que impede a ação: esconde o botão destrutivo e a descrição. */
  readonly blocked = input<string | null>(null);
  readonly tone = input<'danger' | 'primary'>('danger');
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly descriptionId = `gef-confirm-desc-${nextId++}`;

  protected onConfirm(): void {
    if (!this.busy()) {
      this.confirmed.emit();
    }
  }
}
