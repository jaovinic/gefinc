import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL, CLIENT_KIND } from './api.tokens';
import { authGuard } from './auth.guard';
import { SessionService } from './session.service';
import { MemoryTokenStore, TokenStore } from './token-store';

describe('authGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1' },
        { provide: CLIENT_KIND, useValue: 'web' },
        { provide: TokenStore, useValue: new MemoryTokenStore() },
      ],
    });
  });

  it('libera quem está autenticado', () => {
    TestBed.inject(SessionService).authenticated.set(true);
    expect(TestBed.runInInjectionContext(() => authGuard({} as never, {} as never))).toBe(true);
  });

  it('manda quem não está autenticado para /login', () => {
    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });
});
