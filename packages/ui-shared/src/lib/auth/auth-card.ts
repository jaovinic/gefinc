import { Component, input } from '@angular/core';
import { Logo } from '../brand/logo';
import { ThemeToggle } from '../theme/theme-toggle';

/** Cartão centralizado das telas públicas (login, cadastro e recuperação de senha). */
@Component({
  selector: 'gef-auth-card',
  imports: [Logo, ThemeToggle],
  template: `
    <div class="flex min-h-screen items-center justify-center p-4">
      <gef-theme-toggle class="fixed right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-10" variant="icon" />
      <section class="gef-glass-strong w-full max-w-md rounded-2xl p-6 sm:p-8">
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
