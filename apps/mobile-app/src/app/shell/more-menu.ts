import { Component, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GlassToggle, Icon, NAV_ITEMS, ThemeToggle } from '@gefinc/ui-shared';
import { LogoutAction } from '../core/logout';

/**
 * Menu "Mais" (aberto pelo atalho Minha conta do cabeçalho): as áreas que não cabem na ilha de navegação
 * (fluxo de caixa, transferências, categorias e minha conta), a aparência (tema e desfoque) e a saída da conta. Quem o hospeda fecha o
 * painel ao receber `navigated`.
 */
@Component({
  selector: 'gef-more-menu',
  imports: [GlassToggle, Icon, RouterLink, ThemeToggle],
  template: `
    <nav class="space-y-3" aria-label="Mais opções">
      @for (item of items; track item.key) {
        <a class="gef-menu-item gap-3" [routerLink]="item.app" (click)="navigated.emit()">
          <span class="gef-account-tile text-gefinc-primary"><gef-icon [name]="item.icon" [size]="18" /></span>
          <span class="flex-1">{{ item.label }}</span>
          <gef-icon name="chevron-right" class="text-gefinc-muted" [size]="18" />
        </a>
      }
    </nav>
    <section class="mt-4 space-y-2" aria-labelledby="more-appearance">
      <h3 id="more-appearance" class="gef-label">Aparência</h3>
      <gef-theme-toggle />
      <gef-glass-toggle />
    </section>
    <button type="button" class="gef-btn-secondary mt-4 flex w-full items-center justify-center gap-2" (click)="leave()">
      <gef-icon name="logout" [size]="18" />Sair
    </button>
  `,
})
export class MoreMenu {
  protected readonly logout = inject(LogoutAction);
  /** Áreas fora da ilha de navegação: fluxo de caixa, transferências, categorias e minha conta. */
  protected readonly items = NAV_ITEMS.filter((i) => ['cashflow', 'transfers', 'categories', 'settings'].includes(i.key));
  /** O usuário escolheu um destino ou saiu: o painel que hospeda o menu deve fechar. */
  readonly navigated = output<void>();

  /** Fecha o menu antes de sair, para a confirmação de operações pendentes não se empilhar sobre ele. */
  protected leave(): void {
    this.navigated.emit();
    this.logout.run();
  }
}
