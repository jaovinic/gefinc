import { Component, inject, signal } from '@angular/core';
import { DeleteAccount } from '@gefinc/ui-shared';
import { LogoutAction } from '../core/logout';
import { AppLockService } from '../lock/app-lock.service';
import { DevicePreferences } from '../lock/device-preferences';

/**
 * Minha conta: bloqueio por biometria, sair e excluir a conta. A seção de lembretes e a de operações
 * pendentes entram aqui nas histórias seguintes.
 */
@Component({
  selector: 'gef-settings-page',
  imports: [DeleteAccount],
  template: `
    <section class="gef-page space-y-6">
      <h1 class="text-title-lg font-bold">Minha conta</h1>

      <section class="space-y-3 rounded-xl border border-gefinc-border bg-gefinc-surface p-4" aria-labelledby="lock-title">
        <h2 id="lock-title" class="text-title-md font-bold">Bloqueio por biometria</h2>
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
          <select class="gef-input" aria-label="Bloquear depois de" [value]="timeout()" (change)="changeTimeout($event)">
            <option value="0">Na hora</option>
            <option value="1">1 minuto</option>
            <option value="5">5 minutos</option>
          </select>
        </label>
        @if (feedback(); as text) {
          <p data-testid="lock-feedback" class="gef-alert-warning" role="status">{{ text }}</p>
        }
        <p class="text-caption text-gefinc-muted">
          No Android, enquanto o bloqueio estiver ligado, capturas de tela do aplicativo ficam bloqueadas, e o conteúdo some da lista de aplicativos recentes.
        </p>
      </section>

      <button type="button" class="gef-btn-secondary w-full" (click)="logout.run()">Sair</button>
      <gef-delete-account [embedded]="true" />
    </section>
  `,
})
export class SettingsPage {
  protected readonly logout = inject(LogoutAction);
  protected readonly prefs = inject(DevicePreferences);
  private readonly lock = inject(AppLockService);

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

  protected async changeTimeout(event: Event): Promise<void> {
    const minutes = Number((event.target as HTMLSelectElement).value);
    this.timeout.set(minutes);
    if (this.prefs.lock().enabled) {
      await this.prefs.setLock({ timeoutMinutes: minutes });
    }
  }
}
