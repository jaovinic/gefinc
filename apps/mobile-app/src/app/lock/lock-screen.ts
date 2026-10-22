import { Component, effect, inject, untracked } from '@angular/core';
import { LogoutAction } from '../core/logout';
import { AppLockService } from './app-lock.service';

/** Tela que cobre todo o app enquanto ele está bloqueado; não mostra nenhum dado financeiro. */
@Component({
  selector: 'gef-lock-screen',
  template: `
    @if (lock.locked()) {
      <div
        data-testid="lock-screen"
        class="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-gefinc-bg p-6 text-center"
        role="dialog"
        aria-modal="true"
        aria-label="Aplicativo bloqueado"
      >
        <span class="text-title-lg font-extrabold tracking-wide text-gefinc-primary">GEFINC</span>
        <p class="text-body-base text-gefinc-muted">Aplicativo bloqueado</p>
        @if (lock.message(); as message) {
          <p class="gef-alert-error max-w-sm" role="alert">{{ message }}</p>
        }
        <div class="w-full max-w-sm space-y-3">
          @if (!lock.passwordRequired()) {
            <button type="button" class="gef-btn-primary" (click)="lock.unlock()">Desbloquear com biometria</button>
          }
          <button type="button" class="gef-btn-secondary w-full" (click)="logout.run()">Entrar com e-mail e senha</button>
        </div>
      </div>
    }
  `,
})
export class LockScreen {
  protected readonly lock = inject(AppLockService);
  protected readonly logout = inject(LogoutAction);

  constructor() {
    // Ao bloquear, já pede a biometria (o usuário pode tentar de novo pelo botão).
    effect(() => {
      if (this.lock.locked() && !this.lock.passwordRequired()) {
        untracked(() => void this.lock.unlock());
      }
    });
  }
}
