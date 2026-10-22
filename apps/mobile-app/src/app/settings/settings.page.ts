import { Component, inject } from '@angular/core';
import { DeleteAccount } from '@gefinc/ui-shared';
import { LogoutAction } from '../core/logout';

/**
 * Minha conta: sair e excluir a conta. As seções de bloqueio por biometria, lembretes e operações
 * pendentes entram aqui nas histórias seguintes.
 */
@Component({
  selector: 'gef-settings-page',
  imports: [DeleteAccount],
  template: `
    <section class="gef-page space-y-6">
      <h1 class="text-title-lg font-bold">Minha conta</h1>
      <button type="button" class="gef-btn-secondary w-full" (click)="logout.run()">Sair</button>
      <gef-delete-account [embedded]="true" />
    </section>
  `,
})
export class SettingsPage {
  protected readonly logout = inject(LogoutAction);
}
