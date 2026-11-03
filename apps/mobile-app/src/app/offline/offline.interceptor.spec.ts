import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL, NoticeService, ReferenceData } from '@gefinc/ui-shared';
import { BACKGROUND_READ_MAX_MS, offlineInterceptor } from './offline.interceptor';
import { BackgroundReads } from './background-reads';
import { CacheStore } from './cache-store';
import { NetworkStatus } from './network-status';
import { OfflineState } from './offline-state';
import { BYPASS_OFFLINE } from './offline-context';
import { PendingOp, PendingQueue } from './pending-queue';
import { UserScope } from './user-scope';

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
  let userId: string | null;

  beforeEach(() => {
    online.set(true);
    userId = 'user-1';
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
        { provide: UserScope, useValue: { id: () => userId } },
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

  it('GET com falha de rede e sem cópia local devolve OFFLINE_NO_DATA (sem dados salvos), não o aviso de "ação"', async () => {
    const result = new Promise<unknown>((resolve) => http.get(`${API}/dashboard?month=2026-11`).subscribe({ error: resolve }));

    backend.expectOne(`${API}/dashboard?month=2026-11`).error(new ProgressEvent('error'), { status: 0 });

    expect(await result).toMatchObject({
      status: 0,
      error: { code: 'OFFLINE_NO_DATA', detail: 'Sem conexão e sem dados salvos desta tela' },
    });
  });

  it('GET com o aparelho desconectado e sem cópia local devolve OFFLINE_NO_DATA, sem tentar a rede', async () => {
    online.set(false);
    const result = new Promise<unknown>((resolve) => http.get(`${API}/dashboard?month=2026-11`).subscribe({ error: resolve }));

    backend.expectNone(`${API}/dashboard?month=2026-11`);

    expect(await result).toMatchObject({ status: 0, error: { code: 'OFFLINE_NO_DATA' } });
  });

  it('leitura que prepara uma alteração (impacto da exclusão, uso, registro a editar) sem cópia continua dizendo que a AÇÃO precisa de conexão', async () => {
    online.set(false);
    for (const path of ['/transaction-groups/3/impact', '/accounts/1/usage', '/categories/2/usage', '/transaction-groups/3', '/transactions/9']) {
      const error = await new Promise<{ error: { code: string } }>((resolve) => http.get(`${API}${path}`).subscribe({ error: resolve }));
      expect(error.error.code).toBe('OFFLINE_REQUIRES_CONNECTION');
    }
    backend.verify();
  });

  describe('conectado sem internet (a rede não responde)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('com cópia local, depois de 3 s sem resposta responde com a cópia (marcada como antiga) e mantém o pedido vivo', async () => {
      const syncedAt = new Date('2026-11-09T20:00:00Z');
      cache.get.mockResolvedValue({ value: [{ id: 1 }], syncedAt });
      const received = jest.fn();
      const completed = jest.fn();
      http.get(`${API}/accounts`).subscribe({ next: received, complete: completed });

      await jest.advanceTimersByTimeAsync(2_999);
      expect(received).not.toHaveBeenCalled();
      expect(cache.get).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(2);

      expect(received).toHaveBeenCalledWith([{ id: 1 }]);
      expect(completed).toHaveBeenCalled();
      expect(state.staleSince()).toEqual(syncedAt);
      const request = backend.expectOne(`${API}/accounts`);
      expect(request.cancelled).toBe(false);
      request.flush([{ id: 1 }]);
    });

    describe('resposta tardia (depois de a cópia local já ter respondido)', () => {
      const syncedAt = new Date('2026-11-09T20:00:00Z');
      let notices: NoticeService;
      beforeEach(() => {
        notices = TestBed.inject(NoticeService);
        cache.get.mockResolvedValue({ value: [{ id: 1 }], syncedAt });
      });

      async function slowRead(url = `${API}/accounts`) {
        const received = jest.fn();
        http.get(url).subscribe(received);
        await jest.advanceTimersByTimeAsync(3_001);
        return received;
      }

      it('renova a cópia local, marca os dados como atuais e avisa as telas, sem emitir uma segunda resposta ao mesmo pedido', async () => {
        const received = await slowRead();
        expect(state.staleSince()).toEqual(syncedAt);

        backend.expectOne(`${API}/accounts`).flush([{ id: 1 }, { id: 2 }]);
        await jest.advanceTimersByTimeAsync(0);

        expect(received).toHaveBeenCalledTimes(1);
        expect(received).toHaveBeenCalledWith([{ id: 1 }]);
        expect(cache.put).toHaveBeenCalledWith(`${API}/accounts`, [{ id: 1 }, { id: 2 }]);
        expect(state.staleSince()).toBeNull();
        expect(notices.dataChangedCount()).toBe(1);
      });

      it('se a resposta tardia for igual à cópia, renova sem pedir às telas que recarreguem (evita laço)', async () => {
        await slowRead();

        backend.expectOne(`${API}/accounts`).flush([{ id: 1 }]);
        await jest.advanceTimersByTimeAsync(0);

        expect(cache.put).toHaveBeenCalledTimes(1);
        expect(state.staleSince()).toBeNull();
        expect(notices.dataChangedCount()).toBe(0);
      });

      it('mantém no máximo um pedido pendente por endereço: o segundo que perde para a cópia é cancelado', async () => {
        await slowRead();
        const second = jest.fn();
        http.get(`${API}/accounts`).subscribe(second);
        await jest.advanceTimersByTimeAsync(3_001);

        expect(second).toHaveBeenCalledWith([{ id: 1 }]);
        const requests = backend.match(`${API}/accounts`);
        expect(requests.map((r) => r.cancelled)).toEqual([false, true]);
        requests[0].flush([{ id: 1 }]);
      });

      it('endereços diferentes têm cada um o seu pedido pendente', async () => {
        await slowRead(`${API}/accounts`);
        await slowRead(`${API}/categories`);

        const requests = backend.match(() => true);
        expect(requests.map((r) => r.cancelled)).toEqual([false, false]);
        requests.forEach((r) => r.flush([{ id: 1 }]));
      });

      it('encerrar a sessão cancela os pedidos pendentes e nada é gravado', async () => {
        await slowRead();
        const request = backend.expectOne(`${API}/accounts`);

        TestBed.inject(BackgroundReads).cancelAll();

        expect(request.cancelled).toBe(true);
        expect(cache.put).not.toHaveBeenCalled();
        expect(notices.dataChangedCount()).toBe(0);
      });

      it('se o usuário mudou antes de a resposta chegar, ela não é gravada na cópia do outro nem marca os dados como atuais ou avisa as telas', async () => {
        await slowRead();
        userId = 'user-2';

        backend.expectOne(`${API}/accounts`).flush([{ id: 9 }]);
        await jest.advanceTimersByTimeAsync(0);

        expect(cache.put).not.toHaveBeenCalled();
        expect(state.staleSince()).toEqual(syncedAt);
        expect(notices.dataChangedCount()).toBe(0);
      });

      it('abandona o pedido que passa de um minuto em segundo plano', async () => {
        await slowRead();
        const request = backend.expectOne(`${API}/accounts`);

        await jest.advanceTimersByTimeAsync(BACKGROUND_READ_MAX_MS - 100);
        expect(request.cancelled).toBe(false);
        await jest.advanceTimersByTimeAsync(200);

        expect(request.cancelled).toBe(true);
        // Liberado o endereço, um novo pedido que perca para a cópia volta a ficar vivo.
        const again = jest.fn();
        http.get(`${API}/accounts`).subscribe(again);
        await jest.advanceTimersByTimeAsync(3_001);
        const next = backend.expectOne(`${API}/accounts`);
        expect(next.cancelled).toBe(false);
        next.flush([{ id: 1 }]);
      });

      it('erro do servidor na resposta tardia é ignorado: a tela segue com a cópia, sem aviso nem exceção', async () => {
        const received = await slowRead();

        backend.expectOne(`${API}/accounts`).flush({}, { status: 500, statusText: 'Server Error' });
        await jest.advanceTimersByTimeAsync(10);

        expect(received).toHaveBeenCalledTimes(1);
        expect(cache.put).not.toHaveBeenCalled();
        expect(notices.dataChangedCount()).toBe(0);
        expect(state.staleSince()).toEqual(syncedAt);
      });

      it('falha de rede na resposta tardia é ignorada', async () => {
        const received = await slowRead();

        backend.expectOne(`${API}/accounts`).error(new ProgressEvent('error'), { status: 0 });
        await jest.advanceTimersByTimeAsync(10);

        expect(received).toHaveBeenCalledTimes(1);
        expect(notices.dataChangedCount()).toBe(0);
      });

      it('falha ao gravar a cópia da resposta tardia não vira exceção nem aviso', async () => {
        await slowRead();
        cache.put.mockRejectedValueOnce(new Error('disco cheio'));

        backend.expectOne(`${API}/accounts`).flush([{ id: 2 }]);
        await jest.advanceTimersByTimeAsync(10);

        expect(notices.dataChangedCount()).toBe(0);
      });
    });

    it('se a cópia local não puder ser lida (falha do armazenamento), segue aguardando a rede sem estourar exceção', async () => {
      cache.get.mockRejectedValue(new Error('IndexedDB indisponível'));
      const received = jest.fn();
      const failed = jest.fn();
      http.get(`${API}/accounts`).subscribe({ next: received, error: failed });

      await jest.advanceTimersByTimeAsync(30_000);
      const request = backend.expectOne(`${API}/accounts`);
      expect(request.cancelled).toBe(false);
      expect(received).not.toHaveBeenCalled();
      expect(failed).not.toHaveBeenCalled();
      request.flush(['nova']);

      expect(received).toHaveBeenCalledWith(['nova']);
    });

    it('sem cópia local, não desiste da rede: aguarda a resposta normalmente, por mais lenta que seja', async () => {
      cache.get.mockResolvedValue(null);
      const received = jest.fn();
      const failed = jest.fn();
      http.get(`${API}/dashboard?month=2026-11`).subscribe({ next: received, error: failed });

      await jest.advanceTimersByTimeAsync(30_000);
      const request = backend.expectOne(`${API}/dashboard?month=2026-11`);
      expect(request.cancelled).toBe(false);
      expect(failed).not.toHaveBeenCalled();
      request.flush({ ok: true });

      expect(received).toHaveBeenCalledWith({ ok: true });
      expect(state.staleSince()).toBeNull();
    });

    it('resposta que chega antes dos 3 s vale: não consulta nem usa a cópia', async () => {
      cache.get.mockResolvedValue({ value: ['velha'], syncedAt: new Date() });
      const received = jest.fn();
      http.get(`${API}/accounts`).subscribe(received);

      await jest.advanceTimersByTimeAsync(1_000);
      backend.expectOne(`${API}/accounts`).flush(['nova']);
      await jest.advanceTimersByTimeAsync(10_000);

      expect(received).toHaveBeenCalledTimes(1);
      expect(received).toHaveBeenCalledWith(['nova']);
      expect(cache.get).not.toHaveBeenCalled();
      expect(state.staleSince()).toBeNull();
    });

    it('escrita lenta não é cancelada nem enfileirada: o limite de 3 s vale só para leitura', async () => {
      cache.get.mockResolvedValue({ value: ['velha'], syncedAt: new Date() });
      const received = jest.fn();
      http.post(`${API}/transactions/9/pay`, { paymentDate: '2026-11-10' }).subscribe(received);

      await jest.advanceTimersByTimeAsync(20_000);
      const request = backend.expectOne(`${API}/transactions/9/pay`);
      expect(request.cancelled).toBe(false);
      request.flush({ id: 9 });

      expect(received).toHaveBeenCalledWith({ id: 9 });
      expect(queue.enqueue).not.toHaveBeenCalled();
    });
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

    it('lançamento parcelado entra na fila com o sufixo das parcelas no rótulo', async () => {
      online.set(false);
      http.post(`${API}/transaction-groups`, { description: 'Geladeira', recurrenceType: 'INSTALLMENT', totalAmount: '1000.00', totalInstallments: 10 }).subscribe();
      await new Promise((r) => setTimeout(r, 0));

      expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'CREATE_GROUP', label: 'Geladeira · 10x' }));
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

    it('avisa que houve alteração (para reagendar os lembretes) quando a operação é enviada ou enfileirada', async () => {
      const before = state.mutationCount();
      http.post(`${API}/transactions/9/pay`, { paymentDate: '2026-11-10' }).subscribe();
      backend.expectOne(`${API}/transactions/9/pay`).flush({ id: 9 });
      expect(state.mutationCount()).toBe(before + 1);

      online.set(false);
      http.post(`${API}/transactions/8/unpay`, null).subscribe();
      await new Promise((r) => setTimeout(r, 0));
      expect(state.mutationCount()).toBe(before + 2);
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
