const prefs = new Map<string, string>();

jest.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: jest.fn(async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null })),
    set: jest.fn(async ({ key, value }: { key: string; value: string }) => void prefs.set(key, value)),
    remove: jest.fn(async ({ key }: { key: string }) => void prefs.delete(key)),
  },
}));

import { TestBed } from '@angular/core/testing';
import { CACHE_KEY_STORAGE, CacheCrypto } from './cache-crypto';
import { PENDING_SCHEMA, PendingQueue } from './pending-queue';
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

  it('reenviar uma recusada gera uma chave nova (o servidor guarda a recusa sob a chave antiga por 7 dias); com corpo novo, o corpo vale', async () => {
    const q = queue();
    const op = await q.enqueue(create('A'));
    await q.markSending(op.id);
    await q.reject(op.id, 'erro');

    const same = await q.retry(op.id);
    expect(same).toMatchObject({ state: 'PENDING', body: { description: 'A' }, attempted: false });
    expect(same.id).not.toBe(op.id);
    expect(same.error).toBeUndefined();

    await q.reject(same.id, 'erro de novo');
    const changed = await q.retry(same.id, { description: 'A corrigida' });
    expect(changed.id).not.toBe(same.id);
    expect(changed.body).toEqual({ description: 'A corrigida' });
    expect(q.ops()).toHaveLength(1);
  });

  it('só uma operação recusada pode ser reenviada com chave nova (a regra não depende da tela)', async () => {
    const q = queue();
    const op = await q.enqueue(create('A'));

    await expect(q.retry(op.id)).rejects.toThrow('recusada');
    await q.markSending(op.id);
    await expect(q.retry(op.id)).rejects.toThrow('recusada');

    expect(q.ops()).toHaveLength(1);
    expect(q.ops()[0]).toMatchObject({ id: op.id, state: 'SENDING' });
  });

  it('discardAll esvazia a fila e apaga o que estava guardado', async () => {
    const q = queue();
    await q.enqueue(create('A'));

    await q.discardAll();

    expect(q.ops()).toEqual([]);
    expect(prefs.size).toBe(0);
  });

  describe('edições e exclusões (fase B)', () => {
    const tx = { type: 'TRANSACTION' as const, id: 9 };
    const edit = (amount: string, version = 3, entity = tx) => ({
      kind: 'EDIT_TX' as const,
      method: 'PATCH' as const,
      path: `/transactions/${entity.id}`,
      body: { amount, version },
      entity,
      label: `Editar ${amount}`,
    });

    it('operação nova guarda o verbo (padrão POST) e a versão do formato', async () => {
      const q = queue();

      const created = await q.enqueue(create('A'));
      const edited = await q.enqueue(edit('10.00'));

      expect(created).toMatchObject({ method: 'POST', schema: PENDING_SCHEMA });
      expect(edited).toMatchObject({ method: 'PATCH', schema: PENDING_SCHEMA, entity: tx });
    });

    it('fila antiga (sem verbo, sem formato e sem entidade) é normalizada ao carregar, sem perder nada', async () => {
      const q = queue();
      const old = [
        { id: 'a', kind: 'CREATE_GROUP', path: '/transaction-groups', body: { description: 'A' }, createdAt: 1, state: 'PENDING', label: 'A' },
        { id: 'b', kind: 'PAY', path: '/transactions/9/pay', body: { paymentDate: '2026-11-10' }, createdAt: 2, state: 'REJECTED', label: 'Pagar 9', error: 'x' },
        { id: 'c', kind: 'UNPAY', path: '/transactions/9/unpay', body: null, createdAt: 3, state: 'SENDING', label: 'Desfazer 9' },
      ];
      prefs.set('gefinc.pending-ops.7', await TestBed.inject(CacheCrypto).encrypt(JSON.stringify(old)));

      await q.load();

      expect(q.ops().map((o) => [o.id, o.method, o.schema, o.state])).toEqual([
        ['a', 'POST', PENDING_SCHEMA, 'PENDING'],
        ['b', 'POST', PENDING_SCHEMA, 'REJECTED'],
        ['c', 'POST', PENDING_SCHEMA, 'PENDING'],
      ]);
      expect(q.ops()[1]).toMatchObject({ entity: tx, error: 'x' });
      expect(q.ops()[0].entity).toBeUndefined();
    });

    it('duas edições seguidas do mesmo lançamento, ainda não enviadas, viram uma só: a última vale e a chave original fica', async () => {
      const q = queue();
      const first = await q.enqueue(edit('10.00'));
      await q.enqueue(create('outra'));

      const second = await q.enqueue(edit('20.00'));

      expect(second.id).toBe(first.id);
      expect(q.ops().map((o) => o.label)).toEqual(['Editar 20.00', 'outra']);
      expect(q.ops()[0].body).toEqual({ amount: '20.00', version: 3 });
      expect(q.ops()[0].createdAt).toBe(first.createdAt);
      expect(q.pendingCount()).toBe(2);
    });

    it('ao unir, a versão que a fila mantém para a operação prevalece sobre a da tela (que pode estar velha)', async () => {
      const q = queue();
      await q.enqueue(edit('10.00', 5));

      await q.enqueue(edit('20.00', 4));

      expect(q.ops()[0].body).toEqual({ amount: '20.00', version: 5 });
    });

    it('não une quando há outra operação do mesmo lançamento no meio (a ordem importa)', async () => {
      const q = queue();
      await q.enqueue(edit('10.00'));
      await q.enqueue({ kind: 'PAY', path: '/transactions/9/pay', body: { paymentDate: '2026-11-10' }, label: 'Pagar', entity: tx });

      await q.enqueue(edit('20.00'));

      expect(q.ops().map((o) => o.kind)).toEqual(['EDIT_TX', 'PAY', 'EDIT_TX']);
    });

    it('não une com a que já saiu para o servidor (enviando ou tentada): entra outra, que será ajustada depois', async () => {
      const q = queue();
      const first = await q.enqueue(edit('10.00'));
      await q.markSending(first.id);

      await q.enqueue(edit('20.00'));
      expect(q.ops()).toHaveLength(2);

      await q.markPending(first.id);
      const third = await q.enqueue(edit('30.00'));
      expect(q.ops()).toHaveLength(2);
      expect(third.id).toBe(q.ops()[1].id);
      expect(q.ops()[0]).toMatchObject({ attempted: true, state: 'PENDING' });
    });

    it('operação já tentada pela rede (resposta perdida) entra como está, mesmo havendo uma edição esperando', async () => {
      const q = queue();
      await q.enqueue(edit('10.00'));

      await q.enqueue({ ...edit('20.00'), id: '22222222-2222-4222-8222-222222222222', attempted: true });

      expect(q.ops()).toHaveLength(2);
      expect(q.ops()[1]).toMatchObject({ id: '22222222-2222-4222-8222-222222222222', attempted: true });
    });

    it('edições de lançamentos diferentes, ou recusadas, não se unem', async () => {
      const q = queue();
      const first = await q.enqueue(edit('10.00'));
      await q.enqueue(edit('15.00', 1, { type: 'TRANSACTION', id: 10 }));
      expect(q.ops()).toHaveLength(2);

      await q.reject(first.id, 'erro');
      await q.enqueue(edit('20.00'));
      expect(q.ops()).toHaveLength(3);
    });

    it('rewriteVersion ajusta só as edições pendentes da mesma entidade cuja version +1 é a da resposta; a que já foi tentada ganha chave nova', async () => {
      const q = queue();
      const a = await q.enqueue(edit('10.00', 3));
      await q.enqueue({ kind: 'PAY', path: '/transactions/9/pay', body: {}, label: 'p', entity: tx });
      await q.enqueue({ ...edit('20.00', 3), id: '33333333-3333-4333-8333-333333333333', attempted: true });
      await q.enqueue(edit('99.00', 3, { type: 'TRANSACTION', id: 10 }));
      const rejected = await q.enqueue({ ...edit('5.00', 3), attempted: false });
      await q.reject(rejected.id, 'x');

      await q.rewriteVersion(tx, 4);

      const bodies = q.ops().map((o) => (o.body as { version?: number } | null)?.version);
      expect(bodies).toEqual([4, undefined, 4, 3, 3]);
      expect(q.ops()[0].id).toBe(a.id);
      expect(q.ops()[2].id).not.toBe('33333333-3333-4333-8333-333333333333');
      expect(q.ops()[2].attempted).toBe(false);
    });

    it.each([
      ['pulou uma version (alteração externa no meio)', 5],
      ['é igual à guardada', 3],
      ['é menor que a guardada', 2],
    ])('rewriteVersion não reescreve quando a resposta %s: a edição segue com a version velha e a chave', async (_name, response) => {
      const q = queue();
      const attempted = await q.enqueue({ ...edit('10.00', 3), id: '44444444-4444-4444-8444-444444444444', attempted: true });
      await q.enqueue({ kind: 'PAY', path: '/transactions/9/pay', body: {}, label: 'p', entity: tx });
      await q.enqueue(edit('20.00', 3));

      await q.rewriteVersion(tx, response);

      expect(q.ops().map((o) => (o.body as { version?: number } | null)?.version)).toEqual([3, undefined, 3]);
      expect(q.ops()[0]).toMatchObject({ id: attempted.id, attempted: true });
    });

    it('rewriteVersion encadeia: cada sucesso soma 1 e a edição seguinte acompanha passo a passo', async () => {
      const q = queue();
      await q.enqueue(edit('10.00', 3));
      await q.enqueue({ kind: 'UNPAY', path: '/transactions/9/unpay', body: null, label: 'u', entity: tx });
      await q.enqueue(edit('20.00', 3));

      await q.rewriteVersion(tx, 4);
      expect(q.ops().map((o) => (o.body as { version?: number } | null)?.version)).toEqual([4, undefined, 4]);
      await q.rewriteVersion(tx, 5);
      expect(q.ops().map((o) => (o.body as { version?: number } | null)?.version)).toEqual([5, undefined, 5]);
    });

    it('markSending registra que a operação já saiu e isso sobrevive a reabrir o app', async () => {
      const first = queue();
      const op = await first.enqueue(edit('10.00'));
      await first.markSending(op.id);

      const reopened = queue();
      await reopened.load();

      expect(reopened.ops()[0]).toMatchObject({ state: 'PENDING', attempted: true });
    });

    it('hasLive: há operação ainda não enviada para a entidade (recusadas não contam)', async () => {
      const q = queue();
      const op = await q.enqueue(edit('10.00'));

      expect(q.hasLive(tx)).toBe(true);
      expect(q.hasLive({ type: 'TRANSACTION', id: 10 })).toBe(false);
      expect(q.hasLive({ type: 'GROUP', id: 9 })).toBe(false);
      await q.reject(op.id, 'x');
      expect(q.hasLive(tx)).toBe(false);
    });
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
