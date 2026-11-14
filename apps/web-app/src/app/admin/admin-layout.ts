import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ADMIN_NAV_LABEL } from './admin-nav';

/**
 * Casca do painel administrativo: título, a região de alerta permanente (reservada, vazia até a
 * história dos avisos de saúde do sistema) e a região de estado para anúncios educados a leitores de
 * tela. O conteúdo de cada área entra pelo `router-outlet`.
 */
@Component({
  selector: 'gef-admin-layout',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-4" data-testid="admin-panel">
      <header>
        <h1 class="text-title-lg font-bold">{{ title }}</h1>
        <p class="text-body-base text-gefinc-muted">Gerencie usuários e acompanhe o sistema. Você não vê dados financeiros de ninguém.</p>
      </header>

      <div role="alert" data-testid="admin-alert"></div>
      <div role="status" aria-live="polite" data-testid="admin-status">{{ status() }}</div>

      <router-outlet />
    </section>
  `,
})
export class AdminLayout {
  protected readonly title = ADMIN_NAV_LABEL;
  /** Mensagem de estado anunciada sem tirar o foco (carregando, salvo...); as áreas a preenchem. */
  readonly status = signal('');
}
