import { Injectable, signal } from '@angular/core';

/** Estado de frescor dos dados mostrados: `staleSince` é a data da última sincronização quando vêm da cópia local. */
@Injectable({ providedIn: 'root' })
export class OfflineState {
  readonly staleSince = signal<Date | null>(null);
  /** Cresce a cada alteração enviada ou enfileirada; os lembretes observam para reagendar. */
  readonly mutationCount = signal(0);

  /** Cresce a cada operação que foi para a fila no aparelho em vez de ir ao servidor. */
  readonly queuedCount = signal(0);

  queued(): void {
    this.queuedCount.update((n) => n + 1);
  }

  mutated(): void {
    this.mutationCount.update((n) => n + 1);
  }

  markStale(syncedAt: Date): void {
    this.staleSince.set(syncedAt);
  }

  markFresh(): void {
    this.staleSince.set(null);
  }

  /** Fim da sessão: o próximo usuário não herda a data de sincronização do anterior. */
  reset(): void {
    this.staleSince.set(null);
  }
}
