import { Component, inject } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { EmptyView } from '@gefinc/ui-shared';
import { LogoutAction } from '../core/logout';

/** Tela inicial provisória do app; a US7 a transforma no ponto de partida do lançamento rápido. */
@Component({
  selector: 'gef-home-page',
  imports: [IonContent, EmptyView],
  template: `
    <ion-content>
      <header class="flex items-center justify-between border-b border-gefinc-border bg-gefinc-surface px-4 py-3">
        <span class="text-title-md font-extrabold tracking-wide text-gefinc-primary">GEFINC</span>
        <button type="button" class="gef-btn-secondary" (click)="logout.run()">Sair</button>
      </header>
      <gef-empty
        title="Tudo pronto para começar"
        hint="Seus lançamentos e o resumo do mês aparecerão aqui."
      />
    </ion-content>
  `,
})
export class HomePage {
  protected readonly logout = inject(LogoutAction);
}
