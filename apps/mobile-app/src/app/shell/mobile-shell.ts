import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Sheet } from '@gefinc/ui-shared';
import { LogoutAction } from '../core/logout';
import { OfflineBanner } from '../offline/offline-banner';

interface Tab {
  path: string;
  label: string;
  /** Caminho do ícone (viewBox 24x24). */
  icon: string;
  exact: boolean;
}

const TABS: Tab[] = [
  { path: '/', label: 'Painel', exact: true, icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { path: '/lancamentos', label: 'Lançamentos', exact: false, icon: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z' },
  { path: '/faturas', label: 'Faturas', exact: false, icon: 'M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z' },
  { path: '/contas', label: 'Contas', exact: false, icon: 'M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z' },
  { path: '/mais', label: 'Mais', exact: false, icon: 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z' },
];

/**
 * Casca da área autenticada do app: cabeçalho com a marca (respeitando a barra de status), conteúdo
 * rolável e barra de abas inferior (respeitando a barra de gestos). As telas entram como rotas
 * filhas; o lançamento rápido fica fora da casca, em tela cheia.
 */
@Component({
  selector: 'gef-mobile-shell',
  imports: [OfflineBanner, RouterOutlet, RouterLink, RouterLinkActive, Sheet],
  template: `
    <div class="gef-shell">
      <header class="gef-app-header">
        <span class="text-title-md font-extrabold tracking-wide text-gefinc-primary">GEFINC</span>
      </header>
      <gef-offline-banner />
      <main class="gef-shell-main gef-page"><router-outlet /></main>
      <nav class="gef-tabbar" aria-label="Navegação principal">
        @for (tab of tabs; track tab.path) {
          <a
            class="gef-tab"
            [routerLink]="tab.path"
            routerLinkActive="gef-tab-active"
            [routerLinkActiveOptions]="{ exact: tab.exact }"
          >
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor">
              <path [attr.d]="tab.icon" />
            </svg>
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
  protected readonly logout = inject(LogoutAction);
}
