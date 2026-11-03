import { Injectable, inject, signal } from '@angular/core';
import { NETWORK_PORT } from '../native/native-ports';

/** Conexão do aparelho (Capacitor Network; no navegador, os eventos online/offline). */
@Injectable({ providedIn: 'root' })
export class NetworkStatus {
  private readonly port = inject(NETWORK_PORT);
  readonly online = signal(this.port.initial() ?? (typeof navigator === 'undefined' ? true : navigator.onLine));
  private started = false;

  /** Começa a acompanhar a conexão; chamado uma vez na abertura do app. */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    try {
      this.online.set(await this.port.status());
      await this.port.onChange((connected) => this.online.set(connected));
    } catch {
      // Sem o plugin, vale o estado do navegador.
    }
  }
}
