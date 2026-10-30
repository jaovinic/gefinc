import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AccountChip, Icon, Logo, NAV_ITEMS, Sheet } from '@gefinc/ui-shared';
import { LogoutAction } from '../core/logout';
import { OfflineBanner } from '../offline/offline-banner';

interface Tab {
  path: string;
  label: string;
  /** Nome do ícone no conjunto do GEFINC. */
  icon: string;
  exact: boolean;
}

const TABS: Tab[] = [
  { path: '/', label: 'Painel', exact: true, icon: 'dashboard' },
  { path: '/lancamentos', label: 'Lançamentos', exact: false, icon: 'list' },
  { path: '/faturas', label: 'Faturas', exact: false, icon: 'invoice' },
  { path: '/contas', label: 'Contas', exact: false, icon: 'accounts' },
  { path: '/mais', label: 'Mais', exact: false, icon: 'more' },
];

/**
 * Casca da área autenticada do app: cabeçalho com a marca e o atalho Minha conta (respeitando a barra
 * de status), conteúdo rolável e barra de abas inferior (respeitando a barra de gestos). As telas
 * entram como rotas filhas; o lançamento rápido fica fora da casca, em tela cheia.
 */
@Component({
  selector: 'gef-mobile-shell',
  imports: [AccountChip, Icon, Logo, OfflineBanner, RouterOutlet, RouterLink, RouterLinkActive, Sheet],
  template: `
    <div class="gef-shell">
      <header class="gef-app-header">
        <gef-logo class="shrink-0" variant="full" [size]="28" />
        <gef-account-chip class="-my-2 ml-auto min-w-0" [link]="profileLink" />
      </header>
      <gef-offline-banner />
      <main class="gef-shell-main gef-page"><router-outlet /></main>
      <nav class="gef-tabbar" aria-label="Navegação principal">
        @for (tab of tabs; track tab.path) {
          <a
            class="gef-tab"
            [routerLink]="tab.path"
            routerLinkActive="gef-tab-active"
            ariaCurrentWhenActive="page"
            [routerLinkActiveOptions]="{ exact: tab.exact }"
          >
            <gef-icon [name]="tab.icon" [size]="24" />
            <span>{{ tab.label }}</span>
          </a>
        }
      </nav>
    </div>
    <gef-sheet heading="Operações não enviadas" [open]="logout.confirming()" (closed)="logout.cancel()">
      <p class="mb-4 text-body-base">
        Você tem {{ logout.pending() }} {{ logout.pending() === 1 ? 'operação' : 'operações' }} que ainda não {{ logout.pending() === 1 ? 'foi enviada' : 'foram enviadas' }}.
        Se sair agora, {{ logout.pending() === 1 ? 'ela será descartada' : 'elas serão descartadas' }}.
      </p>
      <div class="flex flex-col gap-3">
        <button type="button" class="gef-btn-secondary" (click)="logout.cancel()">Voltar</button>
        <button type="button" class="gef-btn-danger" (click)="logout.confirmDiscard()">Sair e descartar</button>
      </div>
    </gef-sheet>
  `,
})
export class MobileShell {
  protected readonly tabs = TABS;
  /** Destino do atalho Minha conta no cabeçalho (o mesmo item do menu Mais). */
  protected readonly profileLink = NAV_ITEMS.find((i) => i.key === 'settings')!.app;
  protected readonly logout = inject(LogoutAction);
}
