import { Component, DestroyRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AccountChip, Icon, Logo, Sheet } from '@gefinc/ui-shared';
import { filter, map } from 'rxjs';
import { LogoutAction } from '../core/logout';
import { OfflineBanner } from '../offline/offline-banner';
import { MoreMenu } from './more-menu';

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
];

/**
 * Casca da área autenticada do app: cabeçalho com a marca e o atalho Minha conta (respeitando a barra
 * de status), conteúdo rolável e a ilha de navegação flutuante (respeitando a barra de gestos). O atalho
 * abre o menu Mais (fluxo de caixa, categorias, minha conta, aparência e sair). As telas entram como
 * rotas filhas; o lançamento rápido fica fora da casca, em tela cheia.
 */
@Component({
  selector: 'gef-mobile-shell',
  imports: [AccountChip, Icon, Logo, MoreMenu, OfflineBanner, RouterOutlet, RouterLink, RouterLinkActive, Sheet],
  template: `
    <div class="gef-shell">
      <header class="gef-app-header">
        <gef-logo class="shrink-0" variant="full" [size]="28" />
        <gef-account-chip
          class="-my-2 ml-auto min-w-0"
          mode="action"
          [expanded]="moreOpen()"
          [active]="onAccountPage()"
          (activated)="moreOpen.set(true)"
        />
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
    <gef-sheet heading="Mais" [open]="moreOpen()" (closed)="moreOpen.set(false)">
      <gef-more-menu (navigated)="moreOpen.set(false)" />
    </gef-sheet>
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
  private readonly router = inject(Router);

  /** Menu Mais aberto (pelo atalho Minha conta do cabeçalho). */
  protected readonly moreOpen = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** A rota atual é Minha conta: o atalho fica destacado mesmo com o menu fechado. */
  protected readonly onAccountPage = () => this.url().split(/[?#]/)[0] === '/minha-conta';

  constructor() {
    // Qualquer navegação (inclusive voltar do sistema) fecha o menu.
    const subscription = this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => this.moreOpen.set(false));
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }
}
