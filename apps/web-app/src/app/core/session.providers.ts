import { EnvironmentProviders, Provider, inject, provideAppInitializer } from '@angular/core';
import { Router } from '@angular/router';
import {
  API_BASE_URL,
  CLIENT_KIND,
  LOGIN_REDIRECT,
  MemoryTokenStore,
  SessionService,
  TokenStore,
} from '@gefinc/ui-shared';

/**
 * Sessão do web: token de acesso só em memória e refresh token em cookie HttpOnly (entregue pela API
 * quando o cabeçalho `X-Client: web` está presente). A API é acessada pelo mesmo endereço do site;
 * em desenvolvimento, `proxy.conf.json` encaminha `/api` para o backend.
 */
export function provideSession(): (Provider | EnvironmentProviders)[] {
  return [
    { provide: API_BASE_URL, useValue: '/api/v1' },
    { provide: CLIENT_KIND, useValue: 'web' },
    { provide: TokenStore, useClass: MemoryTokenStore },
    {
      provide: LOGIN_REDIRECT,
      useFactory: () => {
        const router = inject(Router);
        return () => void router.navigate(['/login']);
      },
    },
    provideAppInitializer(() => inject(SessionService).restore()),
  ];
}
