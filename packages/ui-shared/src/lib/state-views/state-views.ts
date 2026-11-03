import { Component, input, output } from '@angular/core';
import { Icon } from '../icons/icon';

/**
 * Estado de carregamento (anunciado a leitores de tela). `spinner` é o padrão; `cards` e `list` mostram
 * a forma do conteúdo que vem a seguir (esqueleto), o que reduz o salto de layout quando os dados chegam.
 */
@Component({
  selector: 'gef-loading',
  host: { class: 'block' },
  template: `
    <div role="status" aria-live="polite" [attr.aria-busy]="true">
      @switch (variant()) {
        @case ('cards') {
          <div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-hidden="true">
            <div class="gef-skeleton col-span-2 h-[4.5rem] lg:col-span-1"></div>
            <div class="gef-skeleton h-[4.5rem]"></div>
            <div class="gef-skeleton h-[4.5rem]"></div>
            <div class="gef-skeleton col-span-2 h-[4.5rem] lg:col-span-1"></div>
          </div>
          <div class="gef-skeleton mt-6 h-44" aria-hidden="true"></div>
        }
        @case ('list') {
          <div class="space-y-3" aria-hidden="true">
            @for (row of rows; track row) {
              <div class="gef-skeleton h-24"></div>
            }
          </div>
        }
        @default {
          <div class="flex items-center justify-center gap-3 p-6 text-gefinc-muted" aria-hidden="true">
            <span class="h-5 w-5 animate-spin rounded-full border-2 border-gefinc-border border-t-gefinc-primary"></span>
          </div>
        }
      }
      <span [class]="variant() === 'spinner' ? 'block pb-6 text-center text-body-base text-gefinc-muted' : 'sr-only'">{{ message() }}</span>
    </div>
  `,
})
export class LoadingView {
  readonly message = input('Carregando…');
  readonly variant = input<'spinner' | 'cards' | 'list'>('spinner');
  protected readonly rows = [1, 2, 3];
}

/** Estado vazio com orientação e, opcionalmente, uma ação (conteúdo projetado). */
@Component({
  selector: 'gef-empty',
  host: { class: 'block' },
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
  host: { class: 'block' },
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
