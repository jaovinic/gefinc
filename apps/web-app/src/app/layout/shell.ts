import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  AccountChip,
  CurrentUser,
  Icon,
  Logo,
  NAV_ITEMS,
  NoticeService,
  SessionService,
  Sheet,
  ThemeToggle,
  type NavItem,
} from '@gefinc/ui-shared';
import { ADMIN_NAV_ITEMS, ADMIN_NAV_LABEL, type AdminNavItem } from '../admin/admin-nav';

const COLLAPSED_KEY = 'gefinc.ui.sidebar-collapsed';

/** Lê a preferência do menu recolhido; o armazenamento pode estar bloqueado (janela privada, políticas). */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) {
      localStorage.setItem(COLLAPSED_KEY, '1');
    } else {
      localStorage.removeItem(COLLAPSED_KEY);
    }
  } catch {
    /* a escolha vale só nesta visita */
  }
}

/**
 * Estrutura da área autenticada: menu lateral à esquerda (logo, áreas com ícone, Minha conta e Sair
 * no rodapé), recolhível para só ícones; em tela estreita vira uma gaveta aberta por botão. Aviso
 * global e conteúdo ficam ao lado. Administradores veem também o grupo "Administração", entre o
 * menu principal e o rodapé (só o web: o app móvel usa o `NAV_ITEMS`, que não tem o painel).
 */
@Component({
  selector: 'gef-shell',
  imports: [AccountChip, Icon, Logo, NgTemplateOutlet, RouterLink, RouterLinkActive, RouterOutlet, Sheet, ThemeToggle],
  template: `
    <ng-template #links let-items>
      @for (item of items; track item.key) {
        <a
          class="gef-nav-link"
          [routerLink]="item.web"
          routerLinkActive="gef-nav-active"
          ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="{ exact: item.web === '/' }"
          [attr.aria-label]="item.label"
          [attr.data-label]="item.label"
          (click)="drawerOpen.set(false)"
        >
          <gef-icon [name]="item.icon" [size]="20" />
          <span class="gef-nav-label">{{ item.label }}</span>
        </a>
      }
    </ng-template>

    <ng-template #adminGroup>
      @if (session.isAdmin()) {
        <div class="flex flex-col gap-1 border-t border-gefinc-border p-3" data-testid="admin-nav-group">
          <p class="gef-nav-group-title" data-testid="admin-nav-title">
            <gef-icon name="shield" [size]="16" />
            <span class="gef-nav-label">{{ adminLabel }}</span>
          </p>
          <nav class="flex flex-col gap-1" [attr.aria-label]="adminLabel">
            <ng-container *ngTemplateOutlet="links; context: { $implicit: adminItems }" />
          </nav>
        </div>
      }
    </ng-template>

    <div class="flex min-h-screen">
      <aside
        class="gef-sidenav"
        data-testid="sidenav"
        [attr.data-collapsed]="collapsed() ? 'true' : null"
      >
        <div class="gef-sidenav-head">
          <a routerLink="/" aria-label="GEFINC, ir para o painel">
            <gef-logo [variant]="collapsed() ? 'symbol' : 'full'" [size]="32" />
          </a>
          <button
            type="button"
            class="gef-sidenav-toggle"
            [attr.aria-label]="collapsed() ? 'Expandir menu' : 'Recolher menu'"
            [attr.aria-expanded]="!collapsed()"
            (click)="toggle()"
          >
            <gef-icon [name]="collapsed() ? 'chevron-right' : 'chevron-left'" [size]="18" />
          </button>
        </div>
        <nav class="gef-sidenav-nav" aria-label="Principal">
          <ng-container *ngTemplateOutlet="links; context: { $implicit: mainItems }" />
        </nav>
        <ng-container *ngTemplateOutlet="adminGroup" />
        <div class="gef-sidenav-footer" data-testid="sidenav-footer">
          <ng-container *ngTemplateOutlet="links; context: { $implicit: footerItems }" />
          <button type="button" class="gef-nav-link" aria-label="Sair" data-label="Sair" (click)="logout()">
            <gef-icon name="logout" [size]="20" />
            <span class="gef-nav-label">Sair</span>
          </button>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="gef-topbar">
          <button type="button" class="gef-sidenav-toggle lg:hidden" aria-label="Abrir menu" (click)="drawerOpen.set(true)">
            <gef-icon name="menu" [size]="22" />
          </button>
          <gef-logo class="shrink-0 lg:hidden" variant="full" [size]="28" />
          <div class="ml-auto flex min-w-0 items-center gap-2">
            <gef-theme-toggle variant="icon" />
            <gef-account-chip class="min-w-0" [link]="profileLink" />
          </div>
        </header>

        @if (notices.message(); as message) {
          <div
            class="flex items-start justify-between gap-4 border-b border-gefinc-warning/40 bg-gefinc-warning/10 px-6 py-3 text-body-base text-gefinc-warning"
            role="alert"
          >
            <span>{{ message }}</span>
            <button type="button" class="underline" (click)="notices.dismiss()">Fechar</button>
          </div>
        }

        <main class="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">
          <router-outlet />
        </main>
      </div>
    </div>

    <gef-sheet heading="Menu" side="left" [open]="drawerOpen()" (closed)="drawerOpen.set(false)">
      <div class="flex h-full flex-col gap-2 p-3">
        <gef-logo variant="full" [size]="28" />
        <nav class="gef-sidenav-nav" aria-label="Menu">
          <ng-container *ngTemplateOutlet="links; context: { $implicit: mainItems }" />
        </nav>
        <ng-container *ngTemplateOutlet="adminGroup" />
        <div class="gef-sidenav-footer">
          <ng-container *ngTemplateOutlet="links; context: { $implicit: footerItems }" />
          <button type="button" class="gef-nav-link" aria-label="Sair" (click)="logout()">
            <gef-icon name="logout" [size]="20" />
            <span class="gef-nav-label">Sair</span>
          </button>
        </div>
      </div>
    </gef-sheet>
  `,
})
export class Shell {
  protected readonly notices = inject(NoticeService);
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly collapsed = signal(readCollapsed());
  protected readonly drawerOpen = signal(false);
  protected readonly adminLabel = ADMIN_NAV_LABEL;
  protected readonly adminItems: readonly AdminNavItem[] = ADMIN_NAV_ITEMS;
  protected readonly mainItems: readonly NavItem[] = NAV_ITEMS.filter((i) => i.key !== 'settings');
  protected readonly footerItems: readonly NavItem[] = NAV_ITEMS.filter((i) => i.key === 'settings');
  /** Destino do atalho Minha conta na barra do topo (o mesmo item do rodapé do menu). */
  protected readonly profileLink = NAV_ITEMS.find((i) => i.key === 'settings')!.web;

  constructor() {
    // O menu "Administração" depende do perfil: garante que ele seja pedido ao abrir a área logada.
    inject(CurrentUser).load();
  }

  protected toggle(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    writeCollapsed(next);
  }

  protected logout(): void {
    this.drawerOpen.set(false);
    this.session.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
