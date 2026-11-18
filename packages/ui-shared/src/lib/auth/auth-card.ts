import { Component, input } from '@angular/core';
import { Logo } from '../brand/logo';
import { ThemeToggle } from '../theme/theme-toggle';

/**
 * Cartão centralizado das telas públicas (login, cadastro e recuperação de senha). O botão de tema fica no
 * canto, rolando junto com o conteúdo; `clearToggle` (ligado por padrão) reserva espaço acima do cartão em
 * telas estreitas, para o botão não cobrir a borda dele. O conteúdo marcado com `cardTop` vem antes do logotipo.
 */
@Component({
  selector: 'gef-auth-card',
  imports: [Logo, ThemeToggle],
  template: `
    <div class="relative flex min-h-screen items-center justify-center p-4" [class]="clearToggle() ? clearClasses : ''">
      <gef-theme-toggle class="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-10" variant="icon" />
      <section class="gef-glass-strong w-full max-w-md rounded-2xl p-6 sm:p-8">
        <ng-content select="[cardTop]" />
        <gef-logo class="mb-5" variant="full" [size]="40" />
        <h1 class="mb-6 text-title-lg font-bold text-gefinc-text">{{ heading() }}</h1>
        <ng-content />
      </section>
    </div>
  `,
})
export class AuthCard {
  readonly heading = input.required<string>();
  readonly clearToggle = input(true);
  protected readonly clearClasses = 'pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:pt-4';
}
