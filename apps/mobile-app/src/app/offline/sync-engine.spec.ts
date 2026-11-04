import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL, NoticeService } from '@gefinc/ui-shared';
import { NetworkStatus } from './network-status';
import { BYPASS_OFFLINE } from './offline-context';
import { NewPendingOp, PENDING_SCHEMA, PendingEntity, PendingOp, PendingQueue, followsVersion } from './pending-queue';
import { SEND_TIMEOUT_MS, SyncEngine } from './sync-engine';

const API = 'http://api.test/api/v1';

/** Fila em memória com a mesma interface da real (a cifra e o armazenamento têm testes próprios). */
class FakeQueue {
  readonly ops = signal<PendingOp[]>([]);
  private seq = 0;
  async enqueue(input: NewPendingOp) {
    const op: PendingOp = {
      ...input,
      method: input.method ?? 'POST',
      schema: PENDING_SCHEMA,
      id: input.id ?? `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`,
      state: 'PENDING',
      createdAt: this.seq,
    };
    this.ops.update((list) => [...list, op]);
    return op;
  }
  async rewriteVersion(entity: PendingEntity, version: number) {
    this.ops.update((list) =>
      list.map((o) =>
        o.state === 'PENDING' && o.entity?.type === entity.type && o.entity.id === entity.id && followsVersion((o.body as { version?: number } | null)?.version, version)
          ? { ...o, body: { ...(o.body as object), version } }
          : o,
      ),
    );
  }
  private set(id: string, patch: Partial<PendingOp>) {
    this.ops.update((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }
  async markSending(id: string) {
    this.set(id, { state: 'SENDING' });
  }
  async markPending(id: string) {
    this.set(id, { state: 'PENDING' });
  }
  async reject(id: string, error: string) {
    this.set(id, { state: 'REJECTED', error });
  }
  async remove(id: string) {
    this.ops.update((list) => list.filter((o) => o.id !== id));
  }
}

describe('SyncEngine (envio das operações pendentes)', () => {
  const online = signal(true);
  let queue: FakeQueue;
  let engine: SyncEngine;
  let http: HttpTestingController;
  let notices: NoticeService;

  async function setup() {
    online.set(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API },
        { provide: PendingQueue, useClass: FakeQueue },
        { provide: NetworkStatus, useValue: { online } },
      ],
    });
    queue = TestBed.inject(PendingQueue) as unknown as FakeQueue;
    engine = TestBed.inject(SyncEngine);
    http = TestBed.inject(HttpTestingController);
    notices = TestBed.inject(NoticeService);
  }

  const create = (label: string) => ({ kind: 'CREATE_GROUP' as const, path: '/transaction-groups', body: { description: label }, label });
  const editTx = (id: number, amount: string, version: number) => ({
    kind: 'EDIT_TX' as const,
    method: 'PATCH' as const,
    path: `/transactions/${id}`,
    body: { amount, version },
    entity: { type: 'TRANSACTION' as const, id },
    label: `Editar ${id}`,
  });
  const deleteGroup = (id: number) => ({
    kind: 'DELETE_GROUP' as const,
    method: 'DELETE' as const,
    path: `/transaction-groups/${id}?confirm=true`,
    body: null,
    entity: { type: 'GROUP' as const, id },
    label: `Excluir ${id}`,
  });
  const pay = (id: number) => ({ kind: 'PAY' as const, path: `/transactions/${id}/pay`, body: { paymentDate: '2026-11-10' }, label: `Pagar ${id}`, entity: { type: 'TRANSACTION' as const, id } });
  /** Deixa o engine avançar até a próxima requisição HTTP. */
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(setup);
  afterEach(() => {
    jest.useRealTimers();
    http.verify();
  });

  it('envia na ordem em que foram feitas, com a chave de idempotência, e remove as enviadas', async () => {
    const a = await queue.enqueue(create('A'));
    const b = await queue.enqueue(pay(9));

    const done = engine.flush();
    await tick();
    const first = http.expectOne(`${API}/transaction-groups`);
    expect(first.request.headers.get('Idempotency-Key')).toBe(a.id);
    expect(first.request.body).toEqual({ description: 'A' });
    expect(first.request.context.get(BYPASS_OFFLINE)).toBe(true);
    first.flush({}, { status: 201, statusText: 'Created' });
    await tick();
    const second = http.expectOne(`${API}/transactions/9/pay`);
    expect(second.request.headers.get('Idempotency-Key')).toBe(b.id);
    second.flush({});
    const result = await done;

    expect(result).toEqual({ sent: 2, rejected: 0, stopped: null });
    expect(queue.ops()).toEqual([]);
    expect(notices.dataChangedCount()).toBeGreaterThan(0);
  });

  it('erro de rede devolve a operação para a fila e interrompe o envio', async () => {
    jest.useFakeTimers();
    await queue.enqueue(create('A'));
    await queue.enqueue(create('B'));

    const done = engine.flush();
    await jest.advanceTimersByTimeAsync(0);
    http.expectOne(`${API}/transaction-groups`).error(new ProgressEvent('error'), { status: 0 });
    const result = await done;

    expect(result).toEqual({ sent: 0, rejected: 0, stopped: 'offline' });
    expect(queue.ops().map((o) => o.state)).toEqual(['PENDING', 'PENDING']);
  });

  it('o envio para por erro de rede mas o aparelho segue "conectado" (portal cativo, sem dados): tenta de novo sozinho, com espera crescente', async () => {
    jest.useFakeTimers();
    await queue.enqueue(create('A'));

    const done = engine.flush();
    await jest.advanceTimersByTimeAsync(0);
    http.expectOne(`${API}/transaction-groups`).error(new ProgressEvent('error'), { status: 0 });
    expect((await done).stopped).toBe('offline');
    expect(online()).toBe(true);

    await jest.advanceTimersByTimeAsync(1_999);
    http.expectNone(`${API}/transaction-groups`);
    await jest.advanceTimersByTimeAsync(2);
    http.expectOne(`${API}/transaction-groups`).error(new ProgressEvent('error'), { status: 0 });
    await jest.advanceTimersByTimeAsync(0);

    // a segunda falha dobra a espera (2 s -> 4 s)
    await jest.advanceTimersByTimeAsync(3_999);
    http.expectNone(`${API}/transaction-groups`);
    await jest.advanceTimersByTimeAsync(2);
    http.expectOne(`${API}/transaction-groups`).flush({}, { status: 201, statusText: 'Created' });
    await jest.advanceTimersByTimeAsync(0);
    expect(queue.ops()).toEqual([]);

    // enviou tudo: nada mais é agendado
    await jest.advanceTimersByTimeAsync(120_000);
    http.expectNone(`${API}/transaction-groups`);
  });

  it('com o aparelho sem conexão de fato, a falha de rede não agenda nova tentativa: a volta da conexão dispara o envio', async () => {
    jest.useFakeTimers();
    await queue.enqueue(create('A'));

    const done = engine.flush();
    await jest.advanceTimersByTimeAsync(0);
    online.set(false);
    http.expectOne(`${API}/transaction-groups`).error(new ProgressEvent('error'), { status: 0 });
    expect((await done).stopped).toBe('offline');

    await jest.advanceTimersByTimeAsync(120_000);
    http.expectNone(`${API}/transaction-groups`);
  });

  it('recusa do servidor (4xx) marca a operação com o motivo e segue com as demais', async () => {
    await queue.enqueue(pay(9));
    await queue.enqueue(create('B'));

    const done = engine.flush();
    await tick();
    http.expectOne(`${API}/transactions/9/pay`).flush({ code: 'CONFLICT', detail: 'Este lançamento já está pago.' }, { status: 409, statusText: 'Conflict' });
    await tick();
    http.expectOne(`${API}/transaction-groups`).flush({}, { status: 201, statusText: 'Created' });
    const result = await done;

    expect(result).toEqual({ sent: 1, rejected: 1, stopped: null });
    expect(queue.ops()).toHaveLength(1);
    expect(queue.ops()[0]).toMatchObject({ state: 'REJECTED', error: 'Este lançamento já está pago.' });
  });

  it('validação recusada (422) também fica para o usuário corrigir', async () => {
    await queue.enqueue(create('B'));

    const done = engine.flush();
    await tick();
    http.expectOne(`${API}/transaction-groups`).flush({ code: 'ACCOUNT_INACTIVE', detail: 'A conta está inativa.' }, { status: 422, statusText: 'Unprocessable Entity' });
    await done;

    expect(queue.ops()[0]).toMatchObject({ state: 'REJECTED', error: 'A conta está inativa.' });
  });

  it('operação ainda em processamento no servidor (409 IDEMPOTENCY_IN_PROGRESS) é tentada de novo, não recusada', async () => {
    jest.useFakeTimers();
    await queue.enqueue(create('A'));

    const done = engine.flush();
    await jest.advanceTimersByTimeAsync(0);
    http.expectOne(`${API}/transaction-groups`).flush({ code: 'IDEMPOTENCY_IN_PROGRESS' }, { status: 409, statusText: 'Conflict' });
    const result = await done;

    expect(result.stopped).toBe('retry');
    expect(queue.ops()[0].state).toBe('PENDING');
  });

  it('5xx e 429 voltam para a fila e são tentados de novo com espera crescente', async () => {
    jest.useFakeTimers();
    await queue.enqueue(create('A'));

    const done = engine.flush();
    await jest.advanceTimersByTimeAsync(0);
    http.expectOne(`${API}/transaction-groups`).flush({}, { status: 503, statusText: 'Unavailable' });
    expect((await done).stopped).toBe('retry');
    expect(queue.ops()[0].state).toBe('PENDING');

    await jest.advanceTimersByTimeAsync(2_000);
    http.expectOne(`${API}/transaction-groups`).flush({}, { status: 429, statusText: 'Too Many Requests' });
    await jest.advanceTimersByTimeAsync(0);

    await jest.advanceTimersByTimeAsync(3_999);
    http.expectNone(`${API}/transaction-groups`);
    await jest.advanceTimersByTimeAsync(2);
    http.expectOne(`${API}/transaction-groups`).flush({}, { status: 201, statusText: 'Created' });
    await jest.advanceTimersByTimeAsync(0);
    expect(queue.ops()).toEqual([]);
  });

  it('não envia nada sem conexão e não roda duas vezes ao mesmo tempo', async () => {
    await queue.enqueue(create('A'));
    online.set(false);
    expect(await engine.flush()).toEqual({ sent: 0, rejected: 0, stopped: 'offline' });
    http.expectNone(`${API}/transaction-groups`);

    online.set(true);
    const first = engine.flush();
    const second = engine.flush();
    await tick();
    http.expectOne(`${API}/transaction-groups`).flush({}, { status: 201, statusText: 'Created' });
    await Promise.all([first, second]);
    expect(queue.ops()).toEqual([]);
  });
  describe('edições e exclusões', () => {
    it('envia com o verbo da operação (PATCH, DELETE) e a chave de idempotência', async () => {
      const a = await queue.enqueue(editTx(9, '20.00', 3));
      const b = await queue.enqueue(deleteGroup(4));

      const done = engine.flush();
      await tick();
      const patch = http.expectOne(`${API}/transactions/9`);
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body).toEqual({ amount: '20.00', version: 3 });
      expect(patch.request.headers.get('Idempotency-Key')).toBe(a.id);
      patch.flush({ id: 9, version: 4 });
      await tick();
      const del = http.expectOne(`${API}/transaction-groups/4?confirm=true`);
      expect(del.request.method).toBe('DELETE');
      expect(del.request.headers.get('Idempotency-Key')).toBe(b.id);
      del.flush(null, { status: 204, statusText: 'No Content' });

      expect(await done).toEqual({ sent: 2, rejected: 0, stopped: null });
      expect(queue.ops()).toEqual([]);
    });

    it('depois de uma edição aplicada, as seguintes do MESMO registro usam a version nova; as de outros não mudam', async () => {
      await queue.enqueue(editTx(9, '20.00', 3));
      await queue.enqueue(pay(9));
      await queue.enqueue(editTx(9, '25.00', 3));
      await queue.enqueue(editTx(10, '7.00', 8));

      const done = engine.flush();
      await tick();
      http.expectOne(`${API}/transactions/9`).flush({ id: 9, version: 4 });
      await tick();
      // o pagamento também muda a version do servidor
      http.expectOne(`${API}/transactions/9/pay`).flush({ id: 9, version: 5 });
      await tick();
      const second = http.expectOne(`${API}/transactions/9`);
      expect(second.request.body).toEqual({ amount: '25.00', version: 5 });
      second.flush({ id: 9, version: 6 });
      await tick();
      const other = http.expectOne(`${API}/transactions/10`);
      expect(other.request.body).toEqual({ amount: '7.00', version: 8 });
      other.flush({ id: 10, version: 9 });
      await done;
    });

    const unpay = (id: number) => ({ kind: 'UNPAY' as const, path: `/transactions/${id}/unpay`, body: null, label: `Desfazer ${id}`, entity: { type: 'TRANSACTION' as const, id } });
    const editGroup = { kind: 'EDIT_GROUP' as const, method: 'PUT' as const, path: '/transaction-groups/4', body: { description: 'X', categoryId: 1, version: 2 }, entity: { type: 'GROUP' as const, id: 4 }, label: 'g' };

    it.each([
      ['desfazer pagamento', unpay],
      ['pagar', pay],
    ])('%s seguido de edição, sem alteração externa: a edição herda a version nova e é enviada', async (_name, make) => {
      await queue.enqueue(make(9));
      await queue.enqueue(editTx(9, '25.00', 3));

      const done = engine.flush();
      await tick();
      http.expectOne((r) => r.url.startsWith(`${API}/transactions/9/`)).flush({ id: 9, version: 4 });
      await tick();
      const edit = http.expectOne(`${API}/transactions/9`);
      expect(edit.request.body).toEqual({ amount: '25.00', version: 4 });
      edit.flush({ id: 9, version: 5 });
      expect(await done).toEqual({ sent: 2, rejected: 0, stopped: null });
    });

    it.each([
      ['desfazer pagamento', unpay],
      ['pagar', pay],
    ])('%s seguido de edição, com alteração externa no meio (a version salta): a edição NÃO é reescrita, leva 409 e vai para as recusadas', async (_name, make) => {
      await queue.enqueue(make(9));
      await queue.enqueue(editTx(9, '25.00', 3));

      const done = engine.flush();
      await tick();
      // outro aparelho editou (3 -> 4) e a nossa operação aplicou (4 -> 5)
      http.expectOne((r) => r.url.startsWith(`${API}/transactions/9/`)).flush({ id: 9, version: 5 });
      await tick();
      const edit = http.expectOne(`${API}/transactions/9`);
      expect(edit.request.body).toEqual({ amount: '25.00', version: 3 });
      edit.flush({ code: 'STALE_VERSION', detail: 'Versão antiga.' }, { status: 409, statusText: 'Conflict' });

      expect(await done).toEqual({ sent: 1, rejected: 1, stopped: null });
      expect(queue.ops()).toHaveLength(1);
      expect(queue.ops()[0]).toMatchObject({ state: 'REJECTED', body: { amount: '25.00', version: 3 } });
      expect(queue.ops()[0].error).toBeTruthy();
    });

    it.each([
      ['+0 (o servidor não muda a version das ocorrências ao editar o grupo)', 3, 3],
      ['+1', 4, 3],
      ['+2', 5, 3],
    ])('edição de grupo seguida de edição de uma ocorrência, resposta %s: a edição segue com a version que a fila guarda', async (_name, responded, expected) => {
      await queue.enqueue(editGroup);
      await queue.enqueue(editTx(9, '25.00', 3));

      const done = engine.flush();
      await tick();
      http.expectOne(`${API}/transaction-groups/4`).flush({ id: 4, version: 3, transactions: [{ id: 9, version: responded }] });
      await tick();
      const edit = http.expectOne(`${API}/transactions/9`);
      expect(edit.request.body).toEqual({ amount: '25.00', version: expected });
      edit.flush({ id: 9, version: 4 });
      await done;
    });

    it('excluir algo que já não existe (404) conta como enviado: é idempotente', async () => {
      await queue.enqueue(deleteGroup(4));

      const done = engine.flush();
      await tick();
      http.expectOne(`${API}/transaction-groups/4?confirm=true`).flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });

      expect(await done).toEqual({ sent: 1, rejected: 0, stopped: null });
      expect(queue.ops()).toEqual([]);
    });

    it('404 numa edição NÃO é sucesso: fica recusada com o motivo', async () => {
      await queue.enqueue(editTx(9, '20.00', 3));

      const done = engine.flush();
      await tick();
      http.expectOne(`${API}/transactions/9`).flush({ code: 'NOT_FOUND', detail: 'Lançamento não encontrado.' }, { status: 404, statusText: 'Not Found' });

      expect(await done).toEqual({ sent: 0, rejected: 1, stopped: null });
      expect(queue.ops()[0]).toMatchObject({ state: 'REJECTED', error: 'Lançamento não encontrado.' });
    });

    it('versão desatualizada (409 STALE_VERSION) vai para as recusadas com motivo legível, sem sobrescrever em silêncio, e as demais seguem', async () => {
      await queue.enqueue(editTx(9, '20.00', 3));
      await queue.enqueue(editTx(10, '7.00', 8));

      const done = engine.flush();
      await tick();
      http.expectOne(`${API}/transactions/9`).flush({ code: 'STALE_VERSION', detail: 'Versão antiga.' }, { status: 409, statusText: 'Conflict' });
      await tick();
      http.expectOne(`${API}/transactions/10`).flush({ id: 10, version: 9 });

      expect(await done).toEqual({ sent: 1, rejected: 1, stopped: null });
      expect(queue.ops()).toHaveLength(1);
      expect(queue.ops()[0]).toMatchObject({ state: 'REJECTED', error: 'Este registro foi alterado em outro dispositivo. Recarregue para ver a versão atual.' });
    });
  });

  describe('envio que não termina (rede "conectada" sem internet)', () => {
    beforeEach(() => jest.useFakeTimers());

    it('passado o limite, aborta a tentativa, devolve a operação à fila com espera e libera o envio para o próximo', async () => {
      const op = await queue.enqueue(editTx(9, '20.00', 3));

      const done = engine.flush();
      await jest.advanceTimersByTimeAsync(0);
      const hung = http.expectOne(`${API}/transactions/9`);
      await jest.advanceTimersByTimeAsync(SEND_TIMEOUT_MS - 1);
      expect(hung.cancelled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);

      expect(await done).toEqual({ sent: 0, rejected: 0, stopped: 'retry' });
      expect(hung.cancelled).toBe(true);
      expect(queue.ops()[0]).toMatchObject({ id: op.id, state: 'PENDING' });
      expect(engine.syncing()).toBe(false);

      // nova tentativa depois da espera (2 s), com a MESMA chave
      await jest.advanceTimersByTimeAsync(1_999);
      http.expectNone(`${API}/transactions/9`);
      await jest.advanceTimersByTimeAsync(2);
      const again = http.expectOne(`${API}/transactions/9`);
      expect(again.request.headers.get('Idempotency-Key')).toBe(op.id);
      again.flush({ id: 9, version: 4 });
      await jest.advanceTimersByTimeAsync(0);
      expect(queue.ops()).toEqual([]);
    });

    it('um flush pedido depois do estouro não recebe a promessa pendurada: roda de novo', async () => {
      await queue.enqueue(create('A'));

      const first = engine.flush();
      await jest.advanceTimersByTimeAsync(0);
      http.expectOne(`${API}/transaction-groups`);
      await jest.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
      await first;

      const second = engine.flush();
      await jest.advanceTimersByTimeAsync(0);
      http.expectOne(`${API}/transaction-groups`).flush({}, { status: 201, statusText: 'Created' });
      expect(await second).toEqual({ sent: 1, rejected: 0, stopped: null });
    });
  });

  it('operação enfileirada enquanto o envio roda sai na mesma rodada, sem esperar outro gatilho', async () => {
    await queue.enqueue(create('A'));

    const done = engine.flush();
    await tick();
    await queue.enqueue(pay(9));
    http.expectOne(`${API}/transaction-groups`).flush({}, { status: 201, statusText: 'Created' });
    await tick();
    http.expectOne(`${API}/transactions/9/pay`).flush({ id: 9, version: 1 });

    expect(await done).toEqual({ sent: 2, rejected: 0, stopped: null });
    expect(queue.ops()).toEqual([]);
  });
});
