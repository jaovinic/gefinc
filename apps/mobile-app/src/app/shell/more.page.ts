import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoutAction } from '../core/logout';

/** Aba "Mais": áreas que não cabem na barra de abas e a saída da conta. */
@Component({
  selector: 'gef-more-page',
  imports: [RouterLink],
  template: `
    <section class="space-y-3">
      <h1 class="text-title-lg font-bold">Mais</h1>
      <a class="gef-menu-item" routerLink="/fluxo-de-caixa">Fluxo de caixa</a>
      <a class="gef-menu-item" routerLink="/categorias">Categorias</a>
      <a class="gef-menu-item" routerLink="/minha-conta">Minha conta</a>
      <button type="button" class="gef-btn-secondary w-full" (click)="logout.run()">Sair</button>
    </section>
  `,
})
export class MorePage {
  protected readonly logout = inject(LogoutAction);
}
