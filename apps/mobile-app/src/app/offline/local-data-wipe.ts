import { Injectable, inject } from '@angular/core';
import type { SessionEndReason } from '@gefinc/ui-shared';
import { CacheCrypto } from './cache-crypto';
import { CacheStore } from './cache-store';
import { DevicePreferences } from '../lock/device-preferences';
import { RemindersService } from '../reminders/reminders.service';
import { PendingQueue } from './pending-queue';
import { UserScope } from './user-scope';

/**
 * Limpeza dos dados locais quando a sessão termina (FR-033).
 *
 * - Sair ou excluir a conta: apaga a cópia local, a fila de operações, as preferências do aparelho, os
 *   lembretes agendados e a chave de cifra.
 * - Sessão perdida (expirada ou revogada): apaga só a cópia local, que se refaz sozinha. A fila e a
 *   chave ficam, para o mesmo usuário continuar de onde parou ao entrar de novo; os dados dela só são
 *   lidos com a chave e só pelo usuário a quem pertencem.
 */
@Injectable({ providedIn: 'root' })
export class LocalDataWipe {
  private readonly cache = inject(CacheStore);
  private readonly crypto = inject(CacheCrypto);
  private readonly queue = inject(PendingQueue);
  private readonly scope = inject(UserScope);
  private readonly prefs = inject(DevicePreferences);
  private readonly reminders = inject(RemindersService);

  async onSessionEnded(reason: SessionEndReason): Promise<void> {
    if (reason === 'expired') {
      const user = this.scope.id();
      if (user) {
        await this.cache.clearUser(user);
      }
      return;
    }
    const user = this.scope.id();
    await this.cache.clearAll();
    await this.queue.discardAll();
    if (user) {
      await this.prefs.clear(user);
    }
    await this.reminders.cancelAll();
    await this.crypto.reset();
  }
}
