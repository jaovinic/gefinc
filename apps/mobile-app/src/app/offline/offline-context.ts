import { HttpContextToken } from '@angular/common/http';

/** Requisições marcadas com isto passam direto pelo interceptor offline (é o próprio envio da fila). */
export const BYPASS_OFFLINE = new HttpContextToken<boolean>(() => false);
