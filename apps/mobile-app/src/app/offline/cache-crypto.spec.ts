import { TestBed } from '@angular/core/testing';
import { CACHE_KEY_STORAGE, CacheCrypto, KeyStorage } from './cache-crypto';

class MemoryKeyStorage implements KeyStorage {
  value: string | null = null;
  async read() {
    return this.value;
  }
  async write(key: string) {
    this.value = key;
  }
  async remove() {
    this.value = null;
  }
}

describe('CacheCrypto (AES-GCM com a chave no armazenamento seguro)', () => {
  let storage: MemoryKeyStorage;

  function crypto() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: CACHE_KEY_STORAGE, useValue: storage }] });
    return TestBed.inject(CacheCrypto);
  }

  beforeEach(() => (storage = new MemoryKeyStorage()));

  it('cifra e decifra, e o texto cifrado não revela o conteúdo', async () => {
    const c = crypto();
    const secret = JSON.stringify({ description: 'Consulta médica', amount: '350.00' });

    const payload = await c.encrypt(secret);

    expect(payload).toMatch(/^v1\.[A-Za-z0-9+/=_-]+\.[A-Za-z0-9+/=_-]+$/);
    expect(payload).not.toContain('Consulta');
    expect(await c.decrypt(payload)).toBe(secret);
  });

  it('usa um vetor de inicialização novo a cada gravação', async () => {
    const c = crypto();

    const a = await c.encrypt('mesmo texto');
    const b = await c.encrypt('mesmo texto');

    expect(a).not.toBe(b);
    expect(a.split('.')[1]).not.toBe(b.split('.')[1]);
  });

  it('guarda uma chave de 256 bits no armazenamento seguro e a reutiliza entre aberturas do app', async () => {
    const first = crypto();
    const payload = await first.encrypt('dado');
    expect(atob(storage.value as string)).toHaveLength(32);

    const reopened = crypto();
    expect(await reopened.decrypt(payload)).toBe('dado');
  });

  it('dado adulterado não é decifrado', async () => {
    const c = crypto();
    const [version, iv, data] = (await c.encrypt('dado')).split('.');
    const flipped = data.slice(0, -2) + (data.endsWith('AA') ? 'BB' : 'AA');

    await expect(c.decrypt(`${version}.${iv}.${flipped}`)).rejects.toThrow();
    await expect(c.decrypt('lixo')).rejects.toThrow();
  });

  it('se a chave se perder, o cache antigo fica ilegível e uma chave nova é criada', async () => {
    const c = crypto();
    const payload = await c.encrypt('dado');
    storage.value = null; // chave perdida (ex.: dados do app limpos)

    const afterLoss = crypto();

    await expect(afterLoss.decrypt(payload)).rejects.toThrow();
    expect(storage.value).not.toBeNull();
    expect(await afterLoss.decrypt(await afterLoss.encrypt('novo'))).toBe('novo');
  });

  it('reset apaga a chave', async () => {
    const c = crypto();
    await c.encrypt('dado');

    await c.reset();

    expect(storage.value).toBeNull();
  });
});
