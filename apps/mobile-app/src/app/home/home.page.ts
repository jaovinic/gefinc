import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardPage, Icon } from '@gefinc/ui-shared';

/**
 * Tela inicial do app: o painel do mês e as duas ações de lançamento rápido, "Nova despesa" e
 * "Nova receita", lado a lado e com o mesmo destaque (FR-018). Cada uma continua a um toque do painel.
 */
@Component({
  selector: 'gef-home-page',
  imports: [DashboardPage, Icon, RouterLink],
  template: `
    <div class="pb-24"><gef-dashboard-page /></div>
    <div class="gef-quick-actions" data-testid="quick-actions">
      <a routerLink="/quick-expense" class="gef-quick-action" data-kind="expense">
        <gef-icon name="arrow-down" [size]="18" />Nova despesa
      </a>
      <a routerLink="/quick-income" class="gef-quick-action" data-kind="income">
        <gef-icon name="arrow-up" [size]="18" />Nova receita
      </a>
    </div>
  `,
})
export class HomePage {}
