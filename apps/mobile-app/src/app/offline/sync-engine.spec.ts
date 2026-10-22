import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL, NoticeService } from '@gefinc/ui-shared';
import { NetworkStatus } from './network-status';
import { BYPASS_OFFLINE } from './offline-context';
import { PendingOp, PendingQueue } from './pending-queue';
import { SyncEngine } from './sync-engine';

const API = 'http://api.test/api/v1';

/** Fila em memória com a mesma interface da real (a cifra e o armazenamento têm testes próprios). */
class FakeQueue {
  readonly ops = signal<PendingOp[]>([]);
  private seq = 0;
  async enqueue(input: Omit<PendingOp, 'id' | 'state' | 'createdAt' | 'error'>) {
    const op: PendingOp = { ...input, id: `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`, state: 'PENDING', createdAt: this.seq };
    this.ops.update((list) => [...list, op]);
    return op;
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
  const pay = (id: number) => ({ kind: 'PAY' as const, path: `/transactions/${id}/pay`, body: { paymentDate: '2026-11-10' }, label: `Pagar ${id}` });
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
    await queue.enqueue(create('A'));
    await queue.enqueue(create('B'));

    const done = engine.flush();
    await tick();
    http.expectOne(`${API}/transaction-groups`).error(new ProgressEvent('error'), { status: 0 });
    const result = await done;

    expect(result).toEqual({ sent: 0, rejected: 0, stopped: 'offline' });
    expect(queue.ops().map((o) => o.state)).toEqual(['PENDING', 'PENDING']);
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
});
