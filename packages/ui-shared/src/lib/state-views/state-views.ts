import { Component, input, output } from '@angular/core';

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
  template: `
    <div class="flex flex-col items-center gap-2 p-8 text-center">
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
}

/** Estado de erro com botão para tentar de novo. */
@Component({
  selector: 'gef-error',
  template: `
    <div class="flex flex-col items-center gap-3 p-8 text-center" role="alert">
      <p class="text-body-base text-gefinc-danger">{{ message() }}</p>
      <button
        type="button"
        class="rounded-lg border border-gefinc-border px-4 py-2 text-body-base text-gefinc-text hover:border-gefinc-primary"
        (click)="retry.emit()"
      >
        Tentar novamente
      </button>
    </div>
  `,
})
export class ErrorView {
  readonly message = input('Não foi possível carregar os dados.');
  readonly retry = output<void>();
}
