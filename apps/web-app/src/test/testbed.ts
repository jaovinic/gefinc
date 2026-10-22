import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  API_BASE_URL,
  CLIENT_KIND,
  MemoryTokenStore,
  TokenStore,
  authInterceptor,
} from '@gefinc/ui-shared';

export const API = '/api/v1';

export const ACCOUNTS = [
  { id: 1, name: 'Itaú', type: 'CHECKING', active: true, version: 0 },
  { id: 2, name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, active: true, version: 0 },
];
export const CATEGORIES = [
  { id: 10, name: 'Alimentação', type: 'EXPENSE', colorHex: '#F97316' },
  { id: 11, name: 'Lazer', type: 'EXPENSE', colorHex: '#EC4899' },
  { id: 20, name: 'Salário', type: 'INCOME', colorHex: '#00E599' },
];

/** HTTP simulado com a sessão web em memória, como nos demais testes das telas. */
export function configureHttpTesting() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: API },
      { provide: CLIENT_KIND, useValue: 'web' },
      { provide: TokenStore, useClass: MemoryTokenStore },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  return {
    http,
    /** Responde as duas consultas de dados de referência (contas e categorias). */
    flushReference() {
      http.expectOne((r) => r.url === `${API}/accounts`).flush(ACCOUNTS);
      http.expectOne((r) => r.url === `${API}/categories`).flush(CATEGORIES);
    },
    expectGet(path: string): TestRequest {
      return http.expectOne((r) => r.method === 'GET' && r.url === `${API}${path}`);
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

export function clickButton(root: HTMLElement, label: string) {
  const button = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  if (!button) {
    throw new Error(`Botão "${label}" não encontrado`);
  }
  (button as HTMLButtonElement).click();
}
