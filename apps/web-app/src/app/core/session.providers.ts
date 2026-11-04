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
import { environment } from '../../environments/environment';

/**
 * Sessão do web: token de acesso só em memória e refresh token em cookie HttpOnly (entregue pela API
 * quando o cabeçalho `X-Client: web` está presente). Em produção a API é acessada diretamente em
 * `api.gefinc.tech` (origem diferente, mas do mesmo site), com CORS e cookie via `withCredentials`;
 * em desenvolvimento, `proxy.conf.json` encaminha `/api` para o backend e o endereço continua `/api/v1`.
 */
export function provideSession(): (Provider | EnvironmentProviders)[] {
  return [
    { provide: API_BASE_URL, useValue: environment.apiUrl },
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
