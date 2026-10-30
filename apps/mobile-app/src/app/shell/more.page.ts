import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon, NAV_ITEMS } from '@gefinc/ui-shared';
import { LogoutAction } from '../core/logout';

/** Aba "Mais": áreas que não cabem na barra de abas (as mesmas do menu do web) e a saída da conta. */
@Component({
  selector: 'gef-more-page',
  imports: [Icon, RouterLink],
  template: `
    <section class="space-y-3">
      <h1 class="text-title-lg font-bold">Mais</h1>
      @for (item of items; track item.key) {
        <a class="gef-menu-item gap-3" [routerLink]="item.app">
          <span class="gef-account-tile text-gefinc-primary"><gef-icon [name]="item.icon" [size]="18" /></span>
          <span class="flex-1">{{ item.label }}</span>
          <gef-icon name="chevron-right" class="text-gefinc-muted" [size]="18" />
        </a>
      }
      <button type="button" class="gef-btn-secondary flex w-full items-center justify-center gap-2" (click)="logout.run()">
        <gef-icon name="logout" [size]="18" />Sair
      </button>
    </section>
  `,
})
export class MorePage {
  protected readonly logout = inject(LogoutAction);
  /** Áreas fora da barra de abas: fluxo de caixa, categorias e minha conta. */
  protected readonly items = NAV_ITEMS.filter((i) => ['cashflow', 'categories', 'settings'].includes(i.key));
}
