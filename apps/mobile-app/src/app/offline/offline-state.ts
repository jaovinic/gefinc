import { Injectable, signal } from '@angular/core';

/** Estado de frescor dos dados mostrados: `staleSince` é a data da última sincronização quando vêm da cópia local. */
@Injectable({ providedIn: 'root' })
export class OfflineState {
  readonly staleSince = signal<Date | null>(null);

  markStale(syncedAt: Date): void {
    this.staleSince.set(syncedAt);
  }

  markFresh(): void {
    this.staleSince.set(null);
  }
}
