import { EnvironmentProviders, Provider, inject, provideAppInitializer } from '@angular/core';
import { Router } from '@angular/router';
import { API_BASE_URL, CLIENT_KIND, LOGIN_REDIRECT, SessionService, TokenStore } from '@gefinc/ui-shared';
import { environment } from '../../environments/environment';
import { SecureTokenStore } from './secure-token-store';

/**
 * Sessão do app móvel: ambos os tokens vêm no corpo das respostas e ficam no armazenamento seguro
 * do dispositivo. Na abertura, carrega os tokens e restaura a sessão.
 */
export function provideSession(): (Provider | EnvironmentProviders)[] {
  return [
    { provide: API_BASE_URL, useValue: environment.apiUrl },
    { provide: CLIENT_KIND, useValue: 'mobile' },
    { provide: TokenStore, useExisting: SecureTokenStore },
    {
      provide: LOGIN_REDIRECT,
      useFactory: () => {
        const router = inject(Router);
        return () => void router.navigate(['/login']);
      },
    },
    provideAppInitializer(async () => {
      // `inject` só funciona antes do primeiro `await`.
      const tokens = inject(SecureTokenStore);
      const session = inject(SessionService);
      await tokens.load();
      await session.restore();
    }),
  ];
}
