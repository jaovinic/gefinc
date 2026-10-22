import { Component, input } from '@angular/core';

/** Cartão centralizado das telas públicas (login, cadastro e recuperação de senha). */
@Component({
  selector: 'gef-auth-card',
  template: `
    <div class="flex min-h-screen items-center justify-center p-4">
      <section class="w-full max-w-md rounded-2xl border border-gefinc-border bg-gefinc-surface p-8">
        <p class="mb-1 text-title-md font-extrabold tracking-wide text-gefinc-primary">GEFINC</p>
        <h1 class="mb-6 text-title-lg font-bold text-gefinc-text">{{ heading() }}</h1>
        <ng-content />
      </section>
    </div>
  `,
})
export class AuthCard {
  readonly heading = input.required<string>();
}
