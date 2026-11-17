import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ADMIN_NAV_LABEL } from './admin-nav';
import { PendingAlert } from './alerts/pending-alert';

/**
 * Casca do painel administrativo: título, a região de alerta permanente (comunicações pendentes de
 * envio) e a região de estado para anúncios educados a leitores de tela. O conteúdo de cada área
 * entra pelo `router-outlet`.
 */
@Component({
  selector: 'gef-admin-layout',
  imports: [PendingAlert, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-4" data-testid="admin-panel">
      <header>
        <h1 class="text-title-lg font-bold">{{ title }}</h1>
        <p class="text-body-base text-gefinc-muted">Gerencie usuários e acompanhe o sistema. Você não vê dados financeiros de ninguém.</p>
      </header>

      <div role="alert" data-testid="admin-alert">
        <gef-pending-alert />
      </div>
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
