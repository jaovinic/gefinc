import { EnvironmentProviders, Injector, Provider, inject, provideAppInitializer } from '@angular/core';
import { DATA_FRESHNESS, OFFLINE_WRITES, PENDING_CHANGE, PENDING_MARKER, SESSION_ENDED, SessionEndReason } from '@gefinc/ui-shared';
import { BackgroundReads } from './background-reads';
import { LocalDataWipe } from './local-data-wipe';
import { OfflineBootstrap } from './offline-bootstrap';
import { OfflineState } from './offline-state';
import { OfflineWarmup } from './offline-warmup';
import { isPendingChange, isPendingRow } from './overlay';

/** De quando são os dados mostrados: as telas dizem "na última sincronização" quando vêm da cópia local. */
export const DATA_FRESHNESS_PROVIDER: Provider = { provide: DATA_FRESHNESS, useFactory: () => inject(OfflineState).staleSince };

/**
 * Modo offline do app móvel: limpeza dos dados locais ao encerrar a sessão, marcação dos itens ainda
 * não enviados na lista e início do acompanhamento de conexão e do envio das pendências. O interceptor
 * (`offlineInterceptor`) é registrado junto do HTTP em `app.config.ts`.
 */
export function provideOffline(): (Provider | EnvironmentProviders)[] {
  return [
    { provide: PENDING_MARKER, useValue: isPendingRow },
    { provide: PENDING_CHANGE, useValue: isPendingChange },
    { provide: OFFLINE_WRITES, useValue: true },
    DATA_FRESHNESS_PROVIDER,
    {
      provide: SESSION_ENDED,
      useFactory: () => {
        const injector = inject(Injector);
        return (reason: SessionEndReason) => {
          // Leituras em segundo plano e o estado de frescor são do usuário que sai (as contas e categorias são esquecidas pela sessão).
          injector.get(BackgroundReads).cancelAll();
          injector.get(OfflineState).reset();
          return injector.get(LocalDataWipe).onSessionEnded(reason);
        };
      },
    },
    provideAppInitializer(() => {
      // `inject` só funciona antes do primeiro `await`.
      const bootstrap = inject(OfflineBootstrap);
      const warmup = inject(OfflineWarmup);
      void bootstrap.start();
      void warmup.start();
    }),
  ];
}
