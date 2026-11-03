import { Component, inject, signal } from '@angular/core';
import { Icon, ProfilePage } from '@gefinc/ui-shared';
import { LogoutAction } from '../core/logout';
import { AppLockService } from '../lock/app-lock.service';
import { DevicePreferences } from '../lock/device-preferences';
import { ReminderKindKey, RemindersService } from '../reminders/reminders.service';

/**
 * Minha conta: perfil e senha (compartilhados com o web), bloqueio por biometria, lembretes de vencimento,
 * sair e excluir a conta.
 */
@Component({
  selector: 'gef-settings-page',
  imports: [Icon, ProfilePage],
  template: `
    <gef-profile-page>
      <section class="space-y-3 gef-card p-4" aria-labelledby="lock-title">
        <h2 id="lock-title" class="flex items-center gap-2 text-title-md font-bold"><gef-icon name="shield" [size]="18" />Bloqueio por biometria</h2>
        <p class="text-body-base text-gefinc-muted">
          Peça a digital ou o rosto para abrir o aplicativo e proteger seus dados financeiros se outra pessoa usar o aparelho.
        </p>
        <label class="flex min-h-11 items-center justify-between gap-3">
          <span>Bloquear o app com biometria</span>
          <input
            type="checkbox"
            role="switch"
            class="h-6 w-6"
            aria-label="Bloquear o app com biometria"
            [checked]="prefs.lock().enabled"
            (change)="toggleLock($event)"
          />
        </label>
        <label class="block">
          <span class="gef-label">Bloquear depois de</span>
          <select class="gef-input" aria-label="Bloquear depois de" (change)="changeTimeout($event)">
            <option value="0" [selected]="timeout() === 0">Na hora</option>
            <option value="1" [selected]="timeout() === 1">1 minuto</option>
            <option value="5" [selected]="timeout() === 5">5 minutos</option>
          </select>
        </label>
        @if (feedback(); as text) {
          <p data-testid="lock-feedback" class="gef-alert-warning" role="status">{{ text }}</p>
        }
        <p class="text-caption text-gefinc-muted">
          No Android, enquanto o bloqueio estiver ligado, capturas de tela do aplicativo ficam bloqueadas, e o conteúdo some da lista de aplicativos recentes.
        </p>
      </section>

      <section class="space-y-3 gef-card p-4" aria-labelledby="reminders-title">
        <h2 id="reminders-title" class="text-title-md font-bold">Lembretes de vencimento</h2>
        <p class="text-body-base text-gefinc-muted">
          Avisos no aparelho antes das contas vencerem. O texto mostra só quantidade e tipo, sem valores nem nomes.
        </p>
        @for (kind of kinds; track kind.key) {
          <label class="flex min-h-11 items-center justify-between gap-3">
            <span>{{ kind.label }}</span>
            <input
              type="checkbox"
              role="switch"
              class="h-6 w-6"
              [attr.aria-label]="kind.label"
              [checked]="prefs.reminders()[kind.key]"
              (change)="toggleReminder($event, kind.key)"
            />
          </label>
        }
        <label class="block">
          <span class="gef-label">Horário dos lembretes</span>
          <select class="gef-input" aria-label="Horário dos lembretes" (change)="changeHour($event)">
            @for (hour of hours; track hour) {
              <option [value]="hour" [selected]="hour === prefs.reminders().hour">{{ hour }}h</option>
            }
          </select>
        </label>
        @if (remindersFeedback(); as text) {
          <p data-testid="reminders-feedback" class="gef-alert-warning" role="status">{{ text }}</p>
        }
      </section>

      <button type="button" class="gef-btn-secondary flex w-full items-center justify-center gap-2" (click)="logout.run()">
        <gef-icon name="logout" [size]="18" />Sair
      </button>
    </gef-profile-page>
  `,
})
export class SettingsPage {
  protected readonly logout = inject(LogoutAction);
  protected readonly prefs = inject(DevicePreferences);
  private readonly lock = inject(AppLockService);
  private readonly reminders = inject(RemindersService);

  protected readonly kinds: { key: ReminderKindKey; label: string }[] = [
    { key: 'dueTomorrow', label: 'Contas que vencem amanhã' },
    { key: 'dueToday', label: 'Contas que vencem hoje' },
    { key: 'overdue', label: 'Contas atrasadas' },
  ];
  protected readonly hours = Array.from({ length: 24 }, (_, i) => i);
  protected readonly remindersFeedback = signal<string | null>(null);

  protected readonly timeout = signal(this.prefs.lock().timeoutMinutes);
  protected readonly feedback = signal<string | null>(null);

  protected async toggleLock(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const wanted = input.checked;
    this.feedback.set(null);
    const result = wanted ? await this.lock.enable(this.timeout()) : await this.lock.disable();
    if (!result.ok) {
      input.checked = !wanted;
      this.feedback.set(result.message);
    }
  }

  protected async toggleReminder(event: Event, kind: ReminderKindKey): Promise<void> {
    const input = event.target as HTMLInputElement;
    const wanted = input.checked;
    this.remindersFeedback.set(null);
    const result = await this.reminders.setKind(kind, wanted);
    if (!result.ok) {
      input.checked = !wanted;
      this.remindersFeedback.set(result.message);
    }
  }

  protected changeHour(event: Event): Promise<void> {
    return this.reminders.setHour(Number((event.target as HTMLSelectElement).value));
  }

  protected async changeTimeout(event: Event): Promise<void> {
    const minutes = Number((event.target as HTMLSelectElement).value);
    this.timeout.set(minutes);
    if (this.prefs.lock().enabled) {
      await this.prefs.setLock({ timeoutMinutes: minutes });
    }
  }
}
