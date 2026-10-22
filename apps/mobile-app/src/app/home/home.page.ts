import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardPage } from '@gefinc/ui-shared';

/**
 * Tela inicial do app: o painel do mês e o botão "+ Nova despesa", ponto de partida do lançamento
 * rápido (FR-014), que continua a um toque do painel.
 */
@Component({
  selector: 'gef-home-page',
  imports: [DashboardPage, RouterLink],
  template: `
    <gef-dashboard-page />
    <a routerLink="/quick-expense" class="gef-fab">+ Nova despesa</a>
  `,
})
export class HomePage {}
