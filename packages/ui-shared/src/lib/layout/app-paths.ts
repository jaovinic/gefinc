import { InjectionToken } from '@angular/core';

/** Caminhos de navegação que as telas compartilhadas usam em atalhos (web e mobile têm rotas diferentes). */
export interface AppPaths {
  transactions: string;
  accounts: string;
}

export const APP_PATHS = new InjectionToken<AppPaths>('APP_PATHS', {
  providedIn: 'root',
  factory: () => ({ transactions: '/transactions', accounts: '/accounts' }),
});
