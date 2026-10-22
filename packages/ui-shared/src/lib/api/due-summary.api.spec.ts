import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './api.tokens';
import { DueSummaryApi } from './due-summary.api';

describe('DueSummaryApi', () => {
  it('consulta os vencimentos do período', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: '/api/v1' }],
    });
    const http = TestBed.inject(HttpTestingController);
    let result: unknown;

    TestBed.inject(DueSummaryApi)
      .get('2026-11-10', '2026-11-24')
      .subscribe((summary) => (result = summary));

    const req = http.expectOne((r) => r.url === '/api/v1/due-summary');
    expect(req.request.params.get('from')).toBe('2026-11-10');
    expect(req.request.params.get('to')).toBe('2026-11-24');
    req.flush({ days: [{ date: '2026-11-11', items: 2, invoices: 0 }], overdue: { items: 1, invoices: 0 } });
    expect(result).toEqual({ days: [{ date: '2026-11-11', items: 2, invoices: 0 }], overdue: { items: 1, invoices: 0 } });
  });
});
