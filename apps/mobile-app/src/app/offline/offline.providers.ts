import { EnvironmentProviders, Injector, Provider, inject, provideAppInitializer } from '@angular/core';
import { PENDING_MARKER, SESSION_ENDED, SessionEndReason } from '@gefinc/ui-shared';
import { LocalDataWipe } from './local-data-wipe';
import { OfflineBootstrap } from './offline-bootstrap';
import { isPendingRow } from './overlay';

/**
 * Modo offline do app móvel: limpeza dos dados locais ao encerrar a sessão, marcação dos itens ainda
 * não enviados na lista e início do acompanhamento de conexão e do envio das pendências. O interceptor
 * (`offlineInterceptor`) é registrado junto do HTTP em `app.config.ts`.
 */
export function provideOffline(): (Provider | EnvironmentProviders)[] {
  return [
    { provide: PENDING_MARKER, useValue: isPendingRow },
    {
      provide: SESSION_ENDED,
      useFactory: () => {
        const injector = inject(Injector);
        return (reason: SessionEndReason) => injector.get(LocalDataWipe).onSessionEnded(reason);
      },
    },
    provideAppInitializer(() => {
      // `inject` só funciona antes do primeiro `await`.
      const bootstrap = inject(OfflineBootstrap);
      void bootstrap.start();
    }),
  ];
}
