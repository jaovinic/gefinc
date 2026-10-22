import { Injectable } from '@angular/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { StoredTokens, TokenStore } from '@gefinc/ui-shared';

const ACCESS_KEY = 'gefinc.access-token';
const REFRESH_KEY = 'gefinc.refresh-token';

/**
 * Tokens no armazenamento seguro do dispositivo (Keychain no iOS, Keystore no Android). Uma cópia em
 * memória atende as leituras síncronas do interceptor; a gravação segura acontece em segundo plano.
 */
@Injectable({ providedIn: 'root' })
export class SecureTokenStore extends TokenStore {
  private access: string | null = null;
  private refresh: string | null = null;

  /** Carrega os tokens guardados; chamado uma vez na abertura do app. */
  async load(): Promise<void> {
    try {
      this.access = (await SecureStorage.getItem(ACCESS_KEY)) as string | null;
      this.refresh = (await SecureStorage.getItem(REFRESH_KEY)) as string | null;
    } catch {
      this.access = null;
      this.refresh = null;
    }
  }

  accessToken(): string | null {
    return this.access;
  }

  refreshToken(): string | null {
    return this.refresh;
  }

  async save(tokens: StoredTokens): Promise<void> {
    this.access = tokens.accessToken;
    await SecureStorage.setItem(ACCESS_KEY, tokens.accessToken);
    if (tokens.refreshToken) {
      this.refresh = tokens.refreshToken;
      await SecureStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    }
  }

  async clear(): Promise<void> {
    this.access = null;
    this.refresh = null;
    await SecureStorage.removeItem(ACCESS_KEY);
    await SecureStorage.removeItem(REFRESH_KEY);
  }
}
