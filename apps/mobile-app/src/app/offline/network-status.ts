import { Injectable, signal } from '@angular/core';
import { Network } from '@capacitor/network';

/** Conexão do aparelho (Capacitor Network; no navegador, os eventos online/offline). */
@Injectable({ providedIn: 'root' })
export class NetworkStatus {
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  private started = false;

  /** Começa a acompanhar a conexão; chamado uma vez na abertura do app. */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    try {
      this.online.set((await Network.getStatus()).connected);
      await Network.addListener('networkStatusChange', (status) => this.online.set(status.connected));
    } catch {
      // Sem o plugin, vale o estado do navegador.
    }
  }
}
