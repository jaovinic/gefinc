import { EnvironmentProviders, Injector, Provider, effect, inject, provideAppInitializer, runInInjectionContext, untracked } from '@angular/core';
import { App } from '@capacitor/app';
import { SessionService } from '@gefinc/ui-shared';
import { SecureTokenStore } from '../core/secure-token-store';
import { AppLockService } from './app-lock.service';

/**
 * Bloqueio por biometria: na abertura do app já começa bloqueado (se o usuário ativou), acompanha a ida
 * e a volta do segundo plano e aplica as preferências ao entrar e ao sair da conta.
 */
export function provideLock(): (Provider | EnvironmentProviders)[] {
  return [
    provideAppInitializer(async () => {
      // `inject` só funciona antes do primeiro `await`.
      const tokens = inject(SecureTokenStore);
      const lock = inject(AppLockService);
      const session = inject(SessionService);
      const injector = inject(Injector);
      // Os tokens dizem de quem são as preferências; carregar de novo é inofensivo.
      await tokens.load();
      await lock.start();
      runInInjectionContext(injector, () =>
        effect(() => {
          const authenticated = session.authenticated();
          untracked(() => void (authenticated ? lock.onSignedIn() : lock.onSignedOut()));
        }),
      );
      try {
        await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            void lock.onForegrounded();
          } else {
            lock.onBackgrounded();
          }
        });
      } catch {
        // Sem o plugin (navegador): o bloqueio na abertura continua valendo.
      }
    }),
  ];
}
