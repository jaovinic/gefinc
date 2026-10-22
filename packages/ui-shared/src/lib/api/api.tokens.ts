import { InjectionToken } from '@angular/core';

/** Endereço base da API, ex.: `/api/v1` (web, com proxy) ou `http://host:8080/api/v1` (mobile). */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');

export type ClientKind = 'web' | 'mobile';

/**
 * `web` recebe o refresh token em cookie HttpOnly (cabeçalho `X-Client: web`); `mobile` recebe no
 * corpo da resposta e o guarda em armazenamento seguro do dispositivo.
 */
export const CLIENT_KIND = new InjectionToken<ClientKind>('CLIENT_KIND');

/** Motivo do fim da sessão local: saída voluntária, sessão perdida (expirada ou revogada) ou conta excluída. */
export type SessionEndReason = 'logout' | 'expired' | 'deleted';

/**
 * Aviso opcional de que a sessão vai ser encerrada, chamado antes de os tokens serem apagados (o app
 * móvel usa para limpar a cópia local dos dados e a fila de operações).
 */
export const SESSION_ENDED = new InjectionToken<(reason: SessionEndReason) => void | Promise<void>>('SESSION_ENDED');

/** Chamado quando a sessão se perde de vez: o app navega para o login (rascunhos já salvos). */
export const LOGIN_REDIRECT = new InjectionToken<() => void>('LOGIN_REDIRECT');
