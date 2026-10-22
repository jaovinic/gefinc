export interface StoredTokens {
  accessToken: string;
  /** Ausente no web: o refresh token fica em cookie HttpOnly, fora do alcance do JavaScript. */
  refreshToken?: string;
}

/** Onde os tokens vivem; cada app fornece a implementação adequada à sua plataforma. */
export abstract class TokenStore {
  abstract accessToken(): string | null;
  abstract refreshToken(): string | null;
  abstract save(tokens: StoredTokens): void | Promise<void>;
  abstract clear(): void | Promise<void>;
}

/** Web: o token de acesso fica só em memória e some ao recarregar a página. */
export class MemoryTokenStore extends TokenStore {
  private access: string | null = null;

  accessToken(): string | null {
    return this.access;
  }

  refreshToken(): string | null {
    return null;
  }

  save(tokens: StoredTokens): void {
    this.access = tokens.accessToken;
  }

  clear(): void {
    this.access = null;
  }
}
