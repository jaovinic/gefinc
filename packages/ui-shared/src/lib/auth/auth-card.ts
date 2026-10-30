import { Component, input } from '@angular/core';
import { Logo } from '../brand/logo';

/** Cartão centralizado das telas públicas (login, cadastro e recuperação de senha). */
@Component({
  selector: 'gef-auth-card',
  imports: [Logo],
  template: `
    <div class="flex min-h-screen items-center justify-center p-4">
      <section class="w-full max-w-md rounded-2xl border border-gefinc-border bg-gefinc-surface p-6 sm:p-8" style="box-shadow: 0 0 0 1px rgb(0 229 153 / 6%), 0 24px 48px -24px rgb(0 180 216 / 25%)">
        <gef-logo class="mb-5" variant="full" [size]="40" />
        <h1 class="mb-6 text-title-lg font-bold text-gefinc-text">{{ heading() }}</h1>
        <ng-content />
      </section>
    </div>
  `,
})
export class AuthCard {
  readonly heading = input.required<string>();
}
