const storage = new Map<string, unknown>();

jest.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    getItem: jest.fn(async (key: string) => storage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: unknown) => void storage.set(key, value)),
    removeItem: jest.fn(async (key: string) => storage.delete(key)),
  },
}));

import { SecureTokenStore } from './secure-token-store';

describe('SecureTokenStore', () => {
  beforeEach(() => storage.clear());

  it('guarda os tokens no armazenamento seguro e os recarrega na abertura', async () => {
    const first = new SecureTokenStore();
    await first.save({ accessToken: 'acesso', refreshToken: 'refresh' });
    expect(first.accessToken()).toBe('acesso');
    expect(storage.get('gefinc.refresh-token')).toBe('refresh');

    const reopened = new SecureTokenStore();
    expect(reopened.accessToken()).toBeNull();
    await reopened.load();
    expect(reopened.accessToken()).toBe('acesso');
    expect(reopened.refreshToken()).toBe('refresh');
  });

  it('mantém o refresh token quando a renovação não traz um novo', async () => {
    const store = new SecureTokenStore();
    await store.save({ accessToken: 'a1', refreshToken: 'r1' });
    await store.save({ accessToken: 'a2' });
    expect(store.accessToken()).toBe('a2');
    expect(store.refreshToken()).toBe('r1');
  });

  it('apaga tudo ao limpar', async () => {
    const store = new SecureTokenStore();
    await store.save({ accessToken: 'a', refreshToken: 'r' });
    await store.clear();
    expect(store.accessToken()).toBeNull();
    expect(storage.size).toBe(0);
  });
});
