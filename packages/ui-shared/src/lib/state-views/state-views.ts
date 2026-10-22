import { Component, input, output } from '@angular/core';
import { Icon } from '../icons/icon';

/** Estado de carregamento (anunciado a leitores de tela). */
@Component({
  selector: 'gef-loading',
  template: `
    <div class="flex items-center justify-center gap-3 p-6 text-gefinc-muted" role="status" aria-live="polite">
      <span
        class="h-5 w-5 animate-spin rounded-full border-2 border-gefinc-border border-t-gefinc-primary"
        aria-hidden="true"
      ></span>
      <span class="text-body-base">{{ message() }}</span>
    </div>
  `,
})
export class LoadingView {
  readonly message = input('Carregando…');
}

/** Estado vazio com orientação e, opcionalmente, uma ação (conteúdo projetado). */
@Component({
  selector: 'gef-empty',
  imports: [Icon],
  template: `
    <div class="flex flex-col items-center gap-2 p-8 text-center">
      <span class="gef-state-icon"><gef-icon [name]="icon()" [size]="28" /></span>
      <p class="text-title-md font-semibold text-gefinc-text">{{ title() }}</p>
      @if (hint()) {
        <p class="text-body-base text-gefinc-muted">{{ hint() }}</p>
      }
      <div class="mt-2"><ng-content /></div>
    </div>
  `,
})
export class EmptyView {
  readonly title = input.required<string>();
  readonly hint = input('');
  readonly icon = input('inbox');
}

/** Estado de erro com botão para tentar de novo. */
@Component({
  selector: 'gef-error',
  imports: [Icon],
  template: `
    <div class="flex flex-col items-center gap-3 p-8 text-center" role="alert">
      <span class="gef-state-icon text-gefinc-danger"><gef-icon name="alert" [size]="28" /></span>
      <p class="text-body-base text-gefinc-danger">{{ message() }}</p>
      <button type="button" class="gef-btn-secondary" (click)="retry.emit()">Tentar novamente</button>
    </div>
  `,
})
export class ErrorView {
  readonly message = input('Não foi possível carregar os dados.');
  readonly retry = output<void>();
}
