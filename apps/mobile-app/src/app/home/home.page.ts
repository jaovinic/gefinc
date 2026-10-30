import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardPage, Icon } from '@gefinc/ui-shared';

/**
 * Tela inicial do app: o painel do mês e um único botão destacado, "Novo lançamento", que abre a tela
 * onde se escolhe receita ou despesa. Continua a um toque do painel (RNF03).
 */
@Component({
  selector: 'gef-home-page',
  imports: [DashboardPage, Icon, RouterLink],
  template: `
    <div class="pb-24"><gef-dashboard-page /></div>
    <div class="gef-quick-actions" data-testid="quick-actions">
      <a routerLink="/novo" class="gef-quick-action">
        <gef-icon name="plus" [size]="20" />Novo lançamento
      </a>
    </div>
  `,
})
export class HomePage {}
