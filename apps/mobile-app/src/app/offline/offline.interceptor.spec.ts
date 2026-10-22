import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL, ReferenceData } from '@gefinc/ui-shared';
import { CacheStore } from './cache-store';
import { NetworkStatus } from './network-status';
import { OfflineState } from './offline-state';
import { BYPASS_OFFLINE } from './offline-context';
import { offlineInterceptor } from './offline.interceptor';
import { PendingOp, PendingQueue } from './pending-queue';

const API = 'http://api.test/api/v1';

describe('offlineInterceptor', () => {
  const online = signal(true);
  const ops = signal<PendingOp[]>([]);
  const cache = { put: jest.fn(async () => undefined), get: jest.fn(async (): Promise<{ value: unknown; syncedAt: Date } | null> => null) };
  const queue = {
    ops,
    enqueue: jest.fn(async (input: Omit<PendingOp, 'id' | 'state' | 'createdAt'>) => {
      const op = { ...input, id: 'op-1', state: 'PENDING' as const, createdAt: 1 };
      ops.update((list) => [...list, op]);
      return op;
    }),
  };
  const reference = {
    accounts: signal([{ id: 1, name: 'Itaú', type: 'CHECKING', active: true, version: 0 }]),
    categories: signal([{ id: 10, name: 'Alimentação', type: 'EXPENSE', colorHex: '#F97316' }]),
  };
  let http: HttpClient;
  let backend: HttpTestingController;
  let state: OfflineState;

  beforeEach(() => {
    online.set(true);
    ops.set([]);
    cache.put.mockClear();
    cache.get.mockReset().mockResolvedValue(null);
    queue.enqueue.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([offlineInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API },
        { provide: CacheStore, useValue: cache },
        { provide: PendingQueue, useValue: queue },
        { provide: NetworkStatus, useValue: { online } },
        { provide: ReferenceData, useValue: reference },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    state = TestBed.inject(OfflineState);
  });
  afterEach(() => backend.verify());

  it('GET com sucesso guarda a resposta na cópia local e marca os dados como atuais', async () => {
    const result = new Promise((resolve) => http.get(`${API}/accounts?includeInactive=true`).subscribe(resolve));
    backend.expectOne(`${API}/accounts?includeInactive=true`).flush([{ id: 1 }]);

    expect(await result).toEqual([{ id: 1 }]);
    expect(cache.put).toHaveBeenCalledWith(`${API}/accounts?includeInactive=true`, [{ id: 1 }]);
    expect(state.staleSince()).toBeNull();
  });

  it('GET sem rede responde com a cópia local e informa a data da última sincronização', async () => {
    const syncedAt = new Date('2026-11-09T20:00:00Z');
    cache.get.mockResolvedValue({ value: [{ id: 1 }], syncedAt });
    const result = new Promise((resolve) => http.get(`${API}/accounts`).subscribe(resolve));

    backend.expectOne(`${API}/accounts`).error(new ProgressEvent('error'), { status: 0 });

    expect(await result).toEqual([{ id: 1 }]);
    expect(state.staleSince()).toEqual(syncedAt);
  });

  it('GET sem rede e sem cópia local devolve o erro', async () => {
    const result = new Promise<unknown>((resolve) => http.get(`${API}/dashboard?month=2026-11`).subscribe({ error: resolve }));

    backend.expectOne(`${API}/dashboard?month=2026-11`).error(new ProgressEvent('error'), { status: 0 });

    expect(await result).toMatchObject({ status: 0 });
  });

  it('erro do servidor (5xx) não é trocado pela cópia local', async () => {
    cache.get.mockResolvedValue({ value: [], syncedAt: new Date() });
    const result = new Promise<unknown>((resolve) => http.get(`${API}/accounts`).subscribe({ error: resolve }));

    backend.expectOne(`${API}/accounts`).flush({}, { status: 500, statusText: 'Server Error' });

    expect(await result).toMatchObject({ status: 500 });
    expect(cache.get).not.toHaveBeenCalled();
  });

  it('não mexe em chamadas de autenticação, de fora da API ou marcadas para ignorar', async () => {
    http.get(`${API}/auth/refresh`).subscribe();
    http.get('http://outro.site/x').subscribe();
    http.get(`${API}/accounts`, { context: new HttpContext().set(BYPASS_OFFLINE, true) }).subscribe();
    backend.expectOne(`${API}/auth/refresh`).flush({});
    backend.expectOne('http://outro.site/x').flush({});
    backend.expectOne(`${API}/accounts`).flush([]);
    await Promise.resolve();

    expect(cache.put).not.toHaveBeenCalled();
  });

  describe('operações permitidas sem conexão (criar lançamento, pagar, desfazer)', () => {
    it('sem conexão enfileira na hora, sem tentar a rede, e responde como aceito', async () => {
      online.set(false);
      const result = await new Promise<unknown>((resolve) =>
        http.post(`${API}/transaction-groups`, { description: 'Mercado', totalAmount: '10.00' }, { observe: 'response' }).subscribe(resolve),
      );

      backend.expectNone(`${API}/transaction-groups`);
      expect(queue.enqueue).toHaveBeenCalledWith({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/), kind: 'CREATE_GROUP', path: '/transaction-groups',
        body: { description: 'Mercado', totalAmount: '10.00' }, label: 'Mercado',
      });
      expect(result).toMatchObject({ status: 202 });
    });

    it('pagar e desfazer sem conexão entram na fila com o corpo certo', async () => {
      online.set(false);
      http.post(`${API}/transactions/9/pay`, { paymentDate: '2026-11-10' }).subscribe();
      http.post(`${API}/transactions/9/unpay`, null).subscribe();
      await new Promise((r) => setTimeout(r, 0));

      expect(queue.enqueue).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'PAY', path: '/transactions/9/pay', body: { paymentDate: '2026-11-10' } }));
      expect(queue.enqueue).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'UNPAY', path: '/transactions/9/unpay', body: null }));
    });

    it('com conexão envia normalmente, sempre com chave de idempotência', async () => {
      const ok = new Promise((resolve) => http.post(`${API}/transactions/9/pay`, { paymentDate: '2026-11-10' }).subscribe(resolve));
      const request = backend.expectOne(`${API}/transactions/9/pay`);
      expect(request.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
      request.flush({ id: 9 });

      expect(await ok).toEqual({ id: 9 });
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('se a rede cair no meio do envio, enfileira com a MESMA chave: o servidor pode já ter registrado e o reenvio não duplica', async () => {
      const dropped = new Promise((resolve) => http.post(`${API}/transactions/8/pay`, { paymentDate: '2026-11-10' }, { observe: 'response' }).subscribe(resolve));
      const request = backend.expectOne(`${API}/transactions/8/pay`);
      const key = request.request.headers.get('Idempotency-Key');
      request.error(new ProgressEvent('error'), { status: 0 });

      expect(await dropped).toMatchObject({ status: 202 });
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
      expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ id: key, kind: 'PAY' }));
    });

    it('recusa do servidor com conexão não é enfileirada', async () => {
      const result = new Promise<unknown>((resolve) => http.post(`${API}/transactions/9/pay`, {}).subscribe({ error: resolve }));
      backend.expectOne(`${API}/transactions/9/pay`).flush({ code: 'CONFLICT' }, { status: 409, statusText: 'Conflict' });

      expect(await result).toMatchObject({ status: 409 });
      expect(queue.enqueue).not.toHaveBeenCalled();
    });
  });

  it('as demais alterações sem conexão avisam que precisam de conexão, sem enviar nada', async () => {
    online.set(false);
    for (const call of [
      () => http.patch(`${API}/transactions/9`, {}),
      () => http.put(`${API}/accounts/1`, {}),
      () => http.delete(`${API}/transaction-groups/3`),
      () => http.post(`${API}/accounts/2/invoices/2026-11/payments`, {}),
      () => http.post(`${API}/categories`, {}),
    ]) {
      const error = await new Promise<{ status: number; error: { code: string } }>((resolve) =>
        call().subscribe({ error: resolve }),
      );
      expect(error.error.code).toBe('OFFLINE_REQUIRES_CONNECTION');
    }
    backend.verify();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  describe('lista de lançamentos com operações pendentes', () => {
    const op: PendingOp = {
      id: 'op-1', kind: 'CREATE_GROUP', path: '/transaction-groups', createdAt: 1, state: 'PENDING', label: 'Mercado',
      body: { description: 'Mercado', recurrenceType: 'VARIABLE', totalAmount: '10.00', accountId: 1, categoryId: 10, purchaseDate: '2026-11-08', firstDueDate: '2026-11-12' },
    };

    it('mostra o lançamento novo na lista mesmo vinda do servidor', async () => {
      ops.set([op]);
      const result = new Promise<{ content: { description: string; id: number }[]; totalElements: number }>((resolve) =>
        http.get<never>(`${API}/transactions?month=2026-11&page=0&size=25`).subscribe(resolve as never),
      );
      backend.expectOne(`${API}/transactions?month=2026-11&page=0&size=25`).flush({ content: [], page: 0, size: 25, totalElements: 0 });

      const page = await result;
      expect(page.totalElements).toBe(1);
      expect(page.content[0]).toMatchObject({ description: 'Mercado' });
      expect(page.content[0].id).toBeLessThan(0);
      // a cópia local guarda a resposta original, sem os itens locais
      expect(cache.put).toHaveBeenCalledWith(expect.any(String), { content: [], page: 0, size: 25, totalElements: 0 });
    });

    it('também mostra na lista vinda da cópia local quando está sem conexão', async () => {
      ops.set([op]);
      online.set(false);
      cache.get.mockResolvedValue({ value: { content: [], page: 0, size: 25, totalElements: 0 }, syncedAt: new Date() });
      const result = new Promise<{ totalElements: number }>((resolve) => http.get<never>(`${API}/transactions?month=2026-11`).subscribe(resolve as never));

      backend.expectNone(`${API}/transactions?month=2026-11`);

      expect((await result).totalElements).toBe(1);
    });
  });
});
