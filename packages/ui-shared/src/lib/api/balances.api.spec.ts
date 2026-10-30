import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Balances } from '@gefinc/core-models';
import { API_BASE_URL } from './api.tokens';
import { BalancesApi } from './balances.api';

describe('BalancesApi', () => {
  it('consulta o saldo por conta e o saldo geral', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: '/api/v1' }],
    });
    const http = TestBed.inject(HttpTestingController);
    const body: Balances = {
      asOf: '2026-11-10',
      total: '1500.00',
      accounts: [{ accountId: 1, name: 'Itaú', type: 'CHECKING', active: true, balance: '1500.00', openingBalance: '0.00' }],
      unlinkedCardPayments: '0.00',
    };
    let result: Balances | undefined;

    TestBed.inject(BalancesApi)
      .get()
      .subscribe((balances) => (result = balances));

    const req = http.expectOne((r) => r.method === 'GET' && r.url === '/api/v1/balances');
    req.flush(body);
    expect(result).toEqual(body);
    http.verify();
  });
});
