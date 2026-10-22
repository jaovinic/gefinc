import { EnvironmentProviders, Injector, Provider, effect, inject, provideAppInitializer, runInInjectionContext, untracked } from '@angular/core';
import { App } from '@capacitor/app';
import { NoticeService, SessionService } from '@gefinc/ui-shared';
import { DevicePreferences } from '../lock/device-preferences';
import { OfflineState } from '../offline/offline-state';
import { RemindersService } from './reminders.service';

/**
 * Lembretes de vencimento: reagenda os avisos ao entrar, ao voltar ao primeiro plano, quando os dados
 * mudam (pagar, criar, enviar pendências) e quando as preferências mudam.
 */
export function provideReminders(): (Provider | EnvironmentProviders)[] {
  return [
    provideAppInitializer(() => {
      // `inject` e `effect` só funcionam antes do primeiro `await`.
      const reminders = inject(RemindersService);
      const session = inject(SessionService);
      const prefs = inject(DevicePreferences);
      const notices = inject(NoticeService);
      const state = inject(OfflineState);
      const injector = inject(Injector);
      runInInjectionContext(injector, () =>
        effect(() => {
          const authenticated = session.authenticated();
          prefs.reminders();
          notices.dataChangedCount();
          state.mutationCount();
          if (authenticated) {
            untracked(() => reminders.scheduleSoon());
          }
        }),
      );
      void reminders.start();
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive && session.authenticated()) {
          reminders.scheduleSoon();
        }
      }).catch(() => undefined);
    }),
  ];
}
