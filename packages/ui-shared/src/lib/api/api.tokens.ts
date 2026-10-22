import { InjectionToken } from '@angular/core';

/** Endereço base da API, ex.: `/api/v1` (web, com proxy) ou `http://host:8080/api/v1` (mobile). */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');

export type ClientKind = 'web' | 'mobile';

/**
 * `web` recebe o refresh token em cookie HttpOnly (cabeçalho `X-Client: web`); `mobile` recebe no
 * corpo da resposta e o guarda em armazenamento seguro do dispositivo.
 */
export const CLIENT_KIND = new InjectionToken<ClientKind>('CLIENT_KIND');

/** Chamado quando a sessão se perde de vez: o app navega para o login (rascunhos já salvos). */
export const LOGIN_REDIRECT = new InjectionToken<() => void>('LOGIN_REDIRECT');
