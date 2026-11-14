import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Ponto de entrada de Usuários até a lista chegar (próxima etapa do painel). */
@Component({
  selector: 'gef-admin-users-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="text-title-md font-bold">Usuários</h2>
    <p class="text-body-base text-gefinc-muted">A lista e a busca de usuários chegam na próxima etapa.</p>
  `,
})
export class AdminUsersPlaceholder {}
