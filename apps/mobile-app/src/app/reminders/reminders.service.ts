import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DueSummaryApi } from '@gefinc/ui-shared';
import { REMINDER_HORIZON_DAYS, planReminders, todayIso } from '@gefinc/utils';
import { firstValueFrom } from 'rxjs';
import { DevicePreferences, ReminderPreferences } from '../lock/device-preferences';
import { NOTIFICATIONS_PORT } from '../native/native-ports';

export type ReminderKindKey = 'dueTomorrow' | 'dueToday' | 'overdue';
export type KindChange = { ok: true } | { ok: false; message: string };

const DEBOUNCE_MS = 1_500;

/**
 * Lembretes de vencimento agendados no próprio aparelho (notificações locais). Nada é enviado pelo
 * servidor: o app consulta as contagens (`/due-summary`), planeja os avisos com `planReminders` e
 * reagenda tudo quando algo muda (abrir o app, sincronizar, pagar, mudar preferências). Um aviso só se
 * atualiza quando o app abre ou sincroniza; um item pago em outro aparelho continua a avisar até lá.
 */
@Injectable({ providedIn: 'root' })
export class RemindersService {
  private readonly prefs = inject(DevicePreferences);
  private readonly port = inject(NOTIFICATIONS_PORT);
  private readonly due = inject(DueSummaryApi);
  private readonly router = inject(Router);

  readonly scheduledCount = signal(0);
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Começa a ouvir o toque nos avisos (uma vez, na abertura do app). */
  async start(): Promise<void> {
    await this.port.onTap((route) => void this.router.navigateByUrl(route));
  }

  /** Agenda de novo daqui a pouco; várias mudanças seguidas viram um único reagendamento. */
  scheduleSoon(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.reschedule();
    }, DEBOUNCE_MS);
  }

  async reschedule(): Promise<void> {
    const prefs = this.prefs.reminders();
    if (!prefs.dueTomorrow && !prefs.dueToday && !prefs.overdue) {
      await this.cancelAll();
      return;
    }
    if ((await this.port.permission()) !== 'granted') {
      return;
    }
    const from = todayIso();
    const to = addDays(from, REMINDER_HORIZON_DAYS);
    let summary;
    try {
      summary = await firstValueFrom(this.due.get(from, to));
    } catch {
      // Sem conexão (ou erro): os avisos já agendados continuam valendo.
      return;
    }
    const plan = planReminders(summary, prefs, new Date());
    await this.port.cancelAll();
    await this.port.schedule(plan.map(({ id, at, title, body, route }) => ({ id, at, title, body, route })));
    this.scheduledCount.set(plan.length);
  }

  async cancelAll(): Promise<void> {
    await this.port.cancelAll();
    this.scheduledCount.set(0);
  }

  /** Liga ou desliga um tipo de aviso; a permissão do sistema só é pedida ao ligar o primeiro. */
  async setKind(kind: ReminderKindKey, enabled: boolean): Promise<KindChange> {
    if (enabled) {
      let permission = await this.port.permission();
      if (permission === 'prompt') {
        permission = await this.port.requestPermission();
      }
      if (permission !== 'granted') {
        return {
          ok: false,
          message: 'Para receber lembretes, libere as notificações do GEFINC nas configurações do aparelho e tente de novo.',
        };
      }
    }
    await this.prefs.setReminders({ [kind]: enabled } as Partial<ReminderPreferences>);
    await this.reschedule();
    return { ok: true };
  }

  async setHour(hour: number): Promise<void> {
    await this.prefs.setReminders({ hour });
    await this.reschedule();
  }
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const next = new Date(y, m - 1, d + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}
