import { Injectable, inject } from '@angular/core';
import { TokenStore } from '@gefinc/ui-shared';

/**
 * Quem é o usuário da sessão, lido do campo `sub` do token de acesso (só para separar os dados locais
 * por usuário; quem valida o token é o servidor).
 */
@Injectable({ providedIn: 'root' })
export class UserScope {
  private readonly tokens = inject(TokenStore);

  id(): string | null {
    const token = this.tokens.accessToken();
    if (!token) {
      return null;
    }
    try {
      const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const sub = (JSON.parse(atob(payload)) as { sub?: unknown }).sub;
      return typeof sub === 'string' && sub !== '' ? sub : null;
    } catch {
      return null;
    }
  }
}
