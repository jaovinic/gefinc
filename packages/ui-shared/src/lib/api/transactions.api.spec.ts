import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { TransactionGroupInput } from '@gefinc/core-models';
import { API_BASE_URL } from './api.tokens';
import { TransactionsApi } from './transactions.api';

const KEY = '3f2b8a52-5b1e-4f58-9c0a-0b6d2a7c9e11';
const INPUT = { description: 'Mercado', recurrenceType: 'VARIABLE' } as unknown as TransactionGroupInput;

describe('TransactionsApi - chave de idempotência', () => {
  let http: HttpTestingController;
  let api: TransactionsApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: '/api/v1' }],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(TransactionsApi);
  });

  it('envia o cabeçalho Idempotency-Key só quando informado', () => {
    api.createGroup(INPUT, KEY).subscribe();
    expect(http.expectOne('/api/v1/transaction-groups').request.headers.get('Idempotency-Key')).toBe(KEY);

    api.pay(7, '2026-11-09', KEY).subscribe();
    expect(http.expectOne('/api/v1/transactions/7/pay').request.headers.get('Idempotency-Key')).toBe(KEY);

    api.unpay(7, KEY).subscribe();
    expect(http.expectOne('/api/v1/transactions/7/unpay').request.headers.get('Idempotency-Key')).toBe(KEY);
  });

  it('não envia o cabeçalho quando não há chave (comportamento do web)', () => {
    api.createGroup(INPUT).subscribe();
    expect(http.expectOne('/api/v1/transaction-groups').request.headers.has('Idempotency-Key')).toBe(false);

    api.pay(7, '2026-11-09').subscribe();
    expect(http.expectOne('/api/v1/transactions/7/pay').request.headers.has('Idempotency-Key')).toBe(false);

    api.unpay(7).subscribe();
    expect(http.expectOne('/api/v1/transactions/7/unpay').request.headers.has('Idempotency-Key')).toBe(false);
  });
});
