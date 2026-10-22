const prefs = new Map<string, string>();

jest.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: jest.fn(async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null })),
    set: jest.fn(async ({ key, value }: { key: string; value: string }) => void prefs.set(key, value)),
    remove: jest.fn(async ({ key }: { key: string }) => void prefs.delete(key)),
  },
}));

import { TestBed } from '@angular/core/testing';
import { CACHE_KEY_STORAGE } from './cache-crypto';
import { PendingQueue } from './pending-queue';
import { UserScope } from './user-scope';

class MemoryKeyStorage {
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

describe('PendingQueue (operações feitas sem conexão)', () => {
  let keys: MemoryKeyStorage;
  let user: string | null;

  function queue() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: CACHE_KEY_STORAGE, useValue: keys },
        { provide: UserScope, useValue: { id: () => user } },
      ],
    });
    return TestBed.inject(PendingQueue);
  }

  const create = (label: string) => ({ kind: 'CREATE_GROUP' as const, path: '/transaction-groups', body: { description: label }, label });

  beforeEach(() => {
    prefs.clear();
    keys = new MemoryKeyStorage();
    user = '7';
  });

  it('mantém a ordem em que as operações foram feitas e dá a cada uma um identificador único', async () => {
    const q = queue();
    const a = await q.enqueue(create('A'));
    const b = await q.enqueue({ kind: 'PAY', path: '/transactions/9/pay', body: { paymentDate: '2026-11-10' }, label: 'Pagar 9' });

    expect(q.ops().map((o) => o.label)).toEqual(['A', 'Pagar 9']);
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.state).toBe('PENDING');
    expect(q.pendingCount()).toBe(2);
  });

  it('usa o identificador informado (a mesma chave de uma tentativa que já saiu para o servidor)', async () => {
    const q = queue();

    const op = await q.enqueue({ ...create('A'), id: '11111111-1111-4111-8111-111111111111' });

    expect(op.id).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('persiste cifrada e recarrega depois de reabrir o app', async () => {
    const first = queue();
    await first.enqueue(create('Consulta médica'));

    expect([...prefs.values()].join('')).not.toContain('Consulta');

    const reopened = queue();
    await reopened.load();
    expect(reopened.ops().map((o) => o.label)).toEqual(['Consulta médica']);
  });

  it('cada usuário tem a sua fila', async () => {
    const q = queue();
    await q.enqueue(create('da Ana'));
    user = '8';
    await q.load();

    expect(q.ops()).toEqual([]);
    user = '7';
    await q.load();
    expect(q.ops()).toHaveLength(1);
  });

  it('estados: enviando, volta a pendente, recusada com o motivo, e só pendentes contam como não enviadas', async () => {
    const q = queue();
    const a = await q.enqueue(create('A'));
    const b = await q.enqueue(create('B'));

    await q.markSending(a.id);
    expect(q.ops()[0].state).toBe('SENDING');
    expect(q.pendingCount()).toBe(2);

    await q.markPending(a.id);
    await q.reject(b.id, 'A conta está inativa.');
    expect(q.ops()[1]).toMatchObject({ state: 'REJECTED', error: 'A conta está inativa.' });
    expect(q.pendingCount()).toBe(1);
    expect(q.rejected().map((o) => o.label)).toEqual(['B']);
  });

  it('remove uma operação enviada ou descartada', async () => {
    const q = queue();
    const a = await q.enqueue(create('A'));
    await q.enqueue(create('B'));

    await q.remove(a.id);

    expect(q.ops().map((o) => o.label)).toEqual(['B']);
    const reopened = queue();
    await reopened.load();
    expect(reopened.ops()).toHaveLength(1);
  });

  it('reenviar uma recusada com o mesmo corpo mantém a chave; com corpo novo gera uma chave nova', async () => {
    const q = queue();
    const op = await q.enqueue(create('A'));
    await q.reject(op.id, 'erro');

    const same = await q.retry(op.id);
    expect(same).toMatchObject({ id: op.id, state: 'PENDING' });
    expect(same.error).toBeUndefined();

    await q.reject(op.id, 'erro de novo');
    const changed = await q.retry(op.id, { description: 'A corrigida' });
    expect(changed.id).not.toBe(op.id);
    expect(changed.body).toEqual({ description: 'A corrigida' });
    expect(q.ops()).toHaveLength(1);
  });

  it('discardAll esvazia a fila e apaga o que estava guardado', async () => {
    const q = queue();
    await q.enqueue(create('A'));

    await q.discardAll();

    expect(q.ops()).toEqual([]);
    expect(prefs.size).toBe(0);
  });

  it('operações que ficaram enviando quando o app fechou voltam a pendentes ao carregar', async () => {
    const first = queue();
    const op = await first.enqueue(create('A'));
    await first.markSending(op.id);

    const reopened = queue();
    await reopened.load();

    expect(reopened.ops()[0].state).toBe('PENDING');
  });
});
