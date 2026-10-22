import { Injectable, effect, inject, untracked } from '@angular/core';
import { App } from '@capacitor/app';
import { NoticeService, SessionService } from '@gefinc/ui-shared';
import { NetworkStatus } from './network-status';
import { OfflineState } from './offline-state';
import { PendingQueue } from './pending-queue';
import { SyncEngine } from './sync-engine';

/**
 * Liga o modo offline ao ciclo de vida do app: carrega a fila do usuário ao entrar, envia as pendências
 * quando a conexão volta e quando o app volta ao primeiro plano.
 */
@Injectable({ providedIn: 'root' })
export class OfflineBootstrap {
  private readonly session = inject(SessionService);
  private readonly network = inject(NetworkStatus);
  private readonly queue = inject(PendingQueue);
  private readonly engine = inject(SyncEngine);
  private readonly state = inject(OfflineState);
  private readonly notices = inject(NoticeService);

  constructor() {
    effect(() => {
      const authenticated = this.session.authenticated();
      untracked(() => {
        if (authenticated) {
          void this.queue.load().then(() => this.engine.flush());
        } else {
          this.queue.ops.set([]);
        }
      });
    });
    effect(() => {
      if (this.session.authenticated() && this.network.online()) {
        untracked(() => void this.engine.flush());
      }
    });
    // A conexão voltou com dados antigos na tela: as telas recarregam e o aviso de "dados de ..." some.
    effect(() => {
      const online = this.network.online();
      untracked(() => {
        if (online && this.session.authenticated() && this.state.staleSince() !== null) {
          this.state.markFresh();
          this.notices.dataChanged();
        }
      });
    });
  }

  async start(): Promise<void> {
    await this.network.start();
    try {
      await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive && this.session.authenticated()) {
          void this.engine.flush();
        }
      });
    } catch {
      // Sem o plugin (navegador), a conexão voltando já dispara o envio.
    }
  }
}
