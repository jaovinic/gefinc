import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '@gefinc/ui-shared';
import { PendingQueue } from '../offline/pending-queue';

/**
 * Ação de sair: encerra a sessão (API e armazenamento seguro) e volta ao login. Com operações ainda
 * não enviadas, pede confirmação antes, porque sair descarta essas operações (FR-033).
 */
@Injectable({ providedIn: 'root' })
export class LogoutAction {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly queue = inject(PendingQueue);

  /** Confirmação aberta (há operações não enviadas). */
  readonly confirming = signal(false);
  readonly pending = this.queue.pendingCount;

  run(): void {
    if (this.queue.pendingCount() > 0) {
      this.confirming.set(true);
      return;
    }
    this.leave();
  }

  cancel(): void {
    this.confirming.set(false);
  }

  /** Sai mesmo com operações pendentes, descartando-as. */
  async confirmDiscard(): Promise<void> {
    await this.queue.discardAll();
    this.confirming.set(false);
    this.leave();
  }

  private leave(): void {
    this.session.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
