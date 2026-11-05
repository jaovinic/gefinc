import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Transfer, TransferInput, TransferPage, TransferUpdate } from '@gefinc/core-models';
import { API_BASE_URL } from './api.tokens';
import { TransfersApi } from './transfers.api';

describe('TransfersApi', () => {
  let http: HttpTestingController;
  let api: TransfersApi;
  const transfer: Transfer = { id: 7, fromAccountId: 1, toAccountId: 2, amount: '100.00', transferDate: '2026-11-10', scheduled: false, version: 0 };
  const input: TransferInput = { fromAccountId: 1, toAccountId: 2, amount: '100.00', transferDate: '2026-11-10' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: '/api/v1' }],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(TransfersApi);
  });
  afterEach(() => http.verify());

  it('lista o mês pedindo só os parâmetros informados (conta 0 não filtra)', () => {
    let result: TransferPage | undefined;
    api.list({ month: '2026-11', page: 0, size: 25 }).subscribe((page) => (result = page));
    const req = http.expectOne((r) => r.method === 'GET' && r.url === '/api/v1/transfers');
    expect(req.request.params.get('month')).toBe('2026-11');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('25');
    expect(req.request.params.has('accountId')).toBe(false);
    const body: TransferPage = { content: [transfer], page: 0, size: 25, totalElements: 1 };
    req.flush(body);
    expect(result).toEqual(body);

    api.list({ month: '2026-11', accountId: 0 }).subscribe();
    const unfiltered = http.expectOne((r) => r.url === '/api/v1/transfers');
    expect(unfiltered.request.params.has('accountId')).toBe(false);
    unfiltered.flush({ content: [], page: 0, size: 50, totalElements: 0 });

    api.list({ month: '2026-11', accountId: 3 }).subscribe();
    const filtered = http.expectOne((r) => r.url === '/api/v1/transfers');
    expect(filtered.request.params.get('accountId')).toBe('3');
    filtered.flush({ content: [], page: 0, size: 50, totalElements: 0 });
  });

  it('cria com POST e envia a Idempotency-Key quando há chave', () => {
    api.create(input, '0b9d8c3a-9d5e-4f4f-9a3c-2f7a1d6e5b10').subscribe();
    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/transfers');
    expect(req.request.body).toEqual(input);
    expect(req.request.headers.get('Idempotency-Key')).toBe('0b9d8c3a-9d5e-4f4f-9a3c-2f7a1d6e5b10');
    req.flush(transfer);
  });

  it('sem chave não envia o cabeçalho', () => {
    api.create(input).subscribe();
    const req = http.expectOne('/api/v1/transfers');
    expect(req.request.headers.has('Idempotency-Key')).toBe(false);
    req.flush(transfer);
  });

  it('edita com PUT completo e exclui com DELETE, ambos com a chave', () => {
    const update: TransferUpdate = { ...input, description: 'Reserva', version: 2 };
    api.update(7, update, 'k-1').subscribe();
    const put = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/v1/transfers/7');
    expect(put.request.body).toEqual(update);
    expect(put.request.headers.get('Idempotency-Key')).toBe('k-1');
    put.flush(transfer);

    api.remove(7, 'k-2').subscribe();
    const del = http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/v1/transfers/7');
    expect(del.request.headers.get('Idempotency-Key')).toBe('k-2');
    del.flush(null, { status: 204, statusText: 'No Content' });
  });
});
