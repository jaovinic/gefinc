import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import {
  API_BASE_URL,
  CLIENT_KIND,
  MemoryTokenStore,
  TokenStore,
  authInterceptor,
} from '../../api';

export const API = '/api/v1';

/** Configura o TestBed com HTTP simulado, sessão web em memória e roteador. */
export function configureAuthTesting(kind: 'web' | 'mobile' = 'web') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: API },
      { provide: CLIENT_KIND, useValue: kind },
      { provide: TokenStore, useClass: MemoryTokenStore },
    ],
  });
  const router = TestBed.inject(Router);
  const navigateByUrl = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true);
  return { http: TestBed.inject(HttpTestingController), navigateByUrl, navigate };
}

export function type(root: HTMLElement, selector: string, value: string) {
  const input = root.querySelector(selector) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

export function submit(root: HTMLElement) {
  (root.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
}
