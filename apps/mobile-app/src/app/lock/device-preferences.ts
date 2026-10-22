import { Injectable, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { UserScope } from '../offline/user-scope';

export interface LockPreferences {
  enabled: boolean;
  /** Minutos em segundo plano antes de bloquear: 0 (na hora), 1 ou 5. */
  timeoutMinutes: number;
}

export interface ReminderPreferences {
  dueTomorrow: boolean;
  dueToday: boolean;
  overdue: boolean;
  /** Hora local do aviso (0 a 23). */
  hour: number;
}

const DEFAULT_LOCK: LockPreferences = { enabled: false, timeoutMinutes: 1 };
const DEFAULT_REMINDERS: ReminderPreferences = { dueTomorrow: false, dueToday: false, overdue: false, hour: 9 };
const keyFor = (user: string) => `gefinc.prefs.${user}`;

/** Preferências do aparelho (bloqueio por biometria e lembretes), por usuário. Nada sensível: sem cifra. */
@Injectable({ providedIn: 'root' })
export class DevicePreferences {
  private readonly scope = inject(UserScope);

  readonly lock = signal<LockPreferences>({ ...DEFAULT_LOCK });
  readonly reminders = signal<ReminderPreferences>({ ...DEFAULT_REMINDERS });

  async load(): Promise<void> {
    const user = this.scope.id();
    let stored: { lock?: Partial<LockPreferences>; reminders?: Partial<ReminderPreferences> } = {};
    if (user) {
      const { value } = await Preferences.get({ key: keyFor(user) });
      try {
        stored = value ? JSON.parse(value) : {};
      } catch {
        stored = {};
      }
    }
    this.lock.set(validLock(stored.lock));
    this.reminders.set(validReminders(stored.reminders));
  }

  async setLock(patch: Partial<LockPreferences>): Promise<void> {
    this.lock.set(validLock({ ...this.lock(), ...patch }));
    await this.persist();
  }

  async setReminders(patch: Partial<ReminderPreferences>): Promise<void> {
    this.reminders.set(validReminders({ ...this.reminders(), ...patch }));
    await this.persist();
  }

  /** Apaga as preferências do usuário (ao sair da conta). */
  async clear(userId: string): Promise<void> {
    await Preferences.remove({ key: keyFor(userId) });
    this.lock.set({ ...DEFAULT_LOCK });
    this.reminders.set({ ...DEFAULT_REMINDERS });
  }

  private async persist(): Promise<void> {
    const user = this.scope.id();
    if (user) {
      await Preferences.set({ key: keyFor(user), value: JSON.stringify({ lock: this.lock(), reminders: this.reminders() }) });
    }
  }
}

function validLock(value: Partial<LockPreferences> | undefined): LockPreferences {
  return {
    enabled: value?.enabled === true,
    timeoutMinutes: [0, 1, 5].includes(value?.timeoutMinutes as number) ? (value?.timeoutMinutes as number) : DEFAULT_LOCK.timeoutMinutes,
  };
}

function validReminders(value: Partial<ReminderPreferences> | undefined): ReminderPreferences {
  const hour = value?.hour;
  return {
    dueTomorrow: value?.dueTomorrow === true,
    dueToday: value?.dueToday === true,
    overdue: value?.overdue === true,
    hour: Number.isInteger(hour) && (hour as number) >= 0 && (hour as number) <= 23 ? (hour as number) : DEFAULT_REMINDERS.hour,
  };
}
