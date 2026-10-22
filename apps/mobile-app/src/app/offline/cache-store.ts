import { Injectable, InjectionToken, inject } from '@angular/core';
import { CacheCrypto } from './cache-crypto';
import { UserScope } from './user-scope';

export { CACHE_KEY_STORAGE } from './cache-crypto';

export interface CacheEntry {
  key: string;
  payload: string;
  syncedAt: number;
  size: number;
}

/** Onde as entradas cifradas ficam guardadas. */
export interface CacheBackend {
  get(key: string): Promise<CacheEntry | undefined>;
  put(entry: CacheEntry): Promise<void>;
  delete(key: string): Promise<void>;
  all(): Promise<CacheEntry[]>;
  clear(): Promise<void>;
}

export class MemoryCacheBackend implements CacheBackend {
  readonly entries = new Map<string, CacheEntry>();
  async get(key: string) {
    return this.entries.get(key);
  }
  async put(entry: CacheEntry) {
    this.entries.set(entry.key, entry);
  }
  async delete(key: string) {
    this.entries.delete(key);
  }
  async all() {
    return [...this.entries.values()];
  }
  async clear() {
    this.entries.clear();
  }
}

/** IndexedDB do WebView; pode ser descartado pelo sistema sem perda de dado do usuário (é só cópia). */
export class IndexedDbCacheBackend implements CacheBackend {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('gefinc-cache', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('entries', { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.db;
  }

  private async run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = action(db.transaction('entries', mode).objectStore('entries'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  get(key: string) {
    return this.run('readonly', (s) => s.get(key) as IDBRequest<CacheEntry | undefined>);
  }
  async put(entry: CacheEntry) {
    await this.run('readwrite', (s) => s.put(entry));
  }
  async delete(key: string) {
    await this.run('readwrite', (s) => s.delete(key));
  }
  all() {
    return this.run('readonly', (s) => s.getAll() as IDBRequest<CacheEntry[]>);
  }
  async clear() {
    await this.run('readwrite', (s) => s.clear());
  }
}

export const CACHE_BACKEND = new InjectionToken<CacheBackend>('CACHE_BACKEND', {
  providedIn: 'root',
  factory: () => (typeof indexedDB === 'undefined' ? new MemoryCacheBackend() : new IndexedDbCacheBackend()),
});

/** Limite de espaço da cópia local (20 MB); passou disso, as entradas mais antigas saem. */
export const CACHE_MAX_BYTES = new InjectionToken<number>('CACHE_MAX_BYTES', { providedIn: 'root', factory: () => 20 * 1024 * 1024 });

/**
 * Cópia local, cifrada e por usuário, das respostas de leitura da API. Serve para mostrar os últimos
 * dados sincronizados quando não há conexão.
 */
@Injectable({ providedIn: 'root' })
export class CacheStore {
  private readonly crypto = inject(CacheCrypto);
  private readonly backend = inject(CACHE_BACKEND);
  private readonly maxBytes = inject(CACHE_MAX_BYTES);
  private readonly scope = inject(UserScope);

  async put(url: string, value: unknown): Promise<void> {
    const user = this.scope.id();
    if (!user) {
      return;
    }
    const key = this.keyFor(user, url);
    const payload = await this.crypto.encrypt(JSON.stringify(value));
    const size = payload.length + key.length;
    if (size > this.maxBytes) {
      return;
    }
    await this.backend.put({ key, payload, syncedAt: Date.now(), size });
    await this.enforceLimit();
  }

  async get<T>(url: string): Promise<{ value: T; syncedAt: Date } | null> {
    const user = this.scope.id();
    if (!user) {
      return null;
    }
    const key = this.keyFor(user, url);
    const entry = await this.backend.get(key);
    if (!entry) {
      return null;
    }
    try {
      return { value: JSON.parse(await this.crypto.decrypt(entry.payload)) as T, syncedAt: new Date(entry.syncedAt) };
    } catch {
      await this.backend.delete(key);
      return null;
    }
  }

  async clearUser(userId: string): Promise<void> {
    for (const entry of await this.backend.all()) {
      if (entry.key.startsWith(`${userId}|`)) {
        await this.backend.delete(entry.key);
      }
    }
  }

  async clearAll(): Promise<void> {
    await this.backend.clear();
  }

  private keyFor(user: string, url: string): string {
    const parsed = new URL(url, 'http://local');
    parsed.searchParams.sort();
    return `${user}|${parsed.pathname}${parsed.search}`;
  }

  private async enforceLimit(): Promise<void> {
    const entries = (await this.backend.all()).sort((a, b) => a.syncedAt - b.syncedAt);
    let total = entries.reduce((sum, e) => sum + e.size, 0);
    for (const entry of entries) {
      if (total <= this.maxBytes) {
        return;
      }
      await this.backend.delete(entry.key);
      total -= entry.size;
    }
  }
}
