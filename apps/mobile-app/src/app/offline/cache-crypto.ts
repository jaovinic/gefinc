import { Injectable, InjectionToken, inject } from '@angular/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

const VERSION = 'v1';
const KEY_NAME = 'gefinc.cache-key';

/** Onde fica a chave de cifra (256 bits, em base64). */
export interface KeyStorage {
  read(): Promise<string | null>;
  write(base64Key: string): Promise<void>;
  remove(): Promise<void>;
}

/** Armazenamento seguro do aparelho: Keystore (Android) ou Keychain (iOS). */
class SecureKeyStorage implements KeyStorage {
  async read(): Promise<string | null> {
    try {
      return (await SecureStorage.getItem(KEY_NAME)) as string | null;
    } catch {
      return null;
    }
  }
  async write(base64Key: string): Promise<void> {
    await SecureStorage.setItem(KEY_NAME, base64Key);
  }
  async remove(): Promise<void> {
    await SecureStorage.removeItem(KEY_NAME);
  }
}

export const CACHE_KEY_STORAGE = new InjectionToken<KeyStorage>('CACHE_KEY_STORAGE', {
  providedIn: 'root',
  factory: () => new SecureKeyStorage(),
});

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/**
 * Cifra AES-GCM (256 bits) dos dados financeiros guardados no aparelho. A chave nasce na primeira
 * gravação e fica no armazenamento seguro; cada cifra usa um vetor de inicialização novo. Formato do
 * texto cifrado: `v1.<iv>.<dados>` (base64). Se a chave se perder, o que foi cifrado fica ilegível.
 */
@Injectable({ providedIn: 'root' })
export class CacheCrypto {
  private readonly storage = inject(CACHE_KEY_STORAGE);
  private key: Promise<CryptoKey> | null = null;

  async encrypt(plain: string): Promise<string> {
    const key = await this.getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
    return `${VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(data))}`;
  }

  async decrypt(payload: string): Promise<string> {
    const [version, iv, data] = payload.split('.');
    if (version !== VERSION || !iv || !data) {
      throw new Error('Texto cifrado inválido');
    }
    const key = await this.getKey();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) as BufferSource }, key, fromBase64(data) as BufferSource);
    return new TextDecoder().decode(plain);
  }

  /** Apaga a chave: tudo o que foi cifrado com ela deixa de poder ser lido. */
  async reset(): Promise<void> {
    this.key = null;
    await this.storage.remove();
  }

  private getKey(): Promise<CryptoKey> {
    this.key ??= this.loadOrCreate();
    return this.key;
  }

  private async loadOrCreate(): Promise<CryptoKey> {
    const stored = await this.storage.read();
    let raw: Uint8Array;
    if (stored) {
      raw = fromBase64(stored);
    } else {
      raw = crypto.getRandomValues(new Uint8Array(32));
      await this.storage.write(toBase64(raw));
    }
    return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
}
