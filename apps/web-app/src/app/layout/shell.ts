import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NoticeService, SessionService } from '@gefinc/ui-shared';

/** Estrutura da área autenticada: cabeçalho com navegação e botão de sair, aviso global e conteúdo. */
@Component({
  selector: 'gef-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex min-h-screen flex-col">
      <header class="flex items-center justify-between border-b border-gefinc-border bg-gefinc-surface px-6 py-3">
        <a routerLink="/" class="text-title-md font-extrabold tracking-wide text-gefinc-primary">GEFINC</a>
        <nav class="flex items-center gap-4" aria-label="Principal">
          @for (item of nav; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="text-gefinc-primary"
              class="text-body-base text-gefinc-muted hover:text-gefinc-text"
              >{{ item.label }}</a
            >
          }
        </nav>
        <button
          type="button"
          class="rounded-lg border border-gefinc-border px-3 py-1.5 text-body-base text-gefinc-text hover:border-gefinc-primary"
          (click)="logout()"
        >
          Sair
        </button>
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

      <main class="mx-auto w-full max-w-7xl flex-1 p-6">
        <router-outlet />
      </main>
    </div>
  `,
})
export class Shell {
  protected readonly notices = inject(NoticeService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  /** Itens de navegação; cada história acrescenta os seus. */
  protected readonly nav: { path: string; label: string }[] = [
    { path: '/', label: 'Painel' },
    { path: '/transactions', label: 'Lançamentos' },
    { path: '/invoices', label: 'Faturas' },
    { path: '/cashflow', label: 'Fluxo de caixa' },
    { path: '/accounts', label: 'Contas' },
    { path: '/categories', label: 'Categorias' },
    { path: '/settings', label: 'Minha conta' },
  ];

  protected logout(): void {
    this.session.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
