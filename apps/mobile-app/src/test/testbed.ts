import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL, CLIENT_KIND, MemoryTokenStore, TokenStore, authInterceptor } from '@gefinc/ui-shared';

export const API = 'http://api.test/api/v1';

export const ACCOUNTS = [
  { id: 1, name: 'Itaú', type: 'CHECKING', holderType: 'PF', icon: 'bank', active: true, version: 0 },
  {
    id: 2, name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, holderType: 'PF', icon: 'card',
    bankAccountId: 1, bankAccountName: 'Itaú', active: true, version: 0,
  },
];
export const CATEGORIES = [
  { id: 10, name: 'Alimentação', type: 'EXPENSE', colorHex: '#F97316' },
  { id: 11, name: 'Outras despesas', type: 'EXPENSE', colorHex: '#94A3B8' },
  { id: 20, name: 'Salário', type: 'INCOME', colorHex: '#00E599' },
];

export function configureMobileTesting(extra: Provider[] = []) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: API },
      { provide: CLIENT_KIND, useValue: 'mobile' },
      { provide: TokenStore, useClass: MemoryTokenStore },
      ...extra,
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  return {
    http,
    flushReference() {
      http.expectOne((r) => r.url === `${API}/accounts`).flush(ACCOUNTS);
      http.expectOne((r) => r.url === `${API}/categories`).flush(CATEGORIES);
    },
  };
}

export function type(root: HTMLElement, selector: string, value: string) {
  const input = root.querySelector(selector) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

export function select(root: HTMLElement, selector: string, value: string) {
  const el = root.querySelector(selector) as HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new Event('change'));
}

/** Escolhe uma conta ou cartão no seletor com ícones. */
export function chooseAccount(fixture: { detectChanges(): void }, root: HTMLElement, accountId: number | string) {
  (root.querySelector('gef-account-picker button[aria-haspopup]') as HTMLButtonElement).click();
  fixture.detectChanges();
  (document.querySelector(`[role="option"][data-account-id="${accountId}"]`) as HTMLElement).click();
  fixture.detectChanges();
}
