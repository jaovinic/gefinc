import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { UserProfile } from '@gefinc/core-models';
import { API_BASE_URL, CLIENT_KIND } from './api.tokens';
import { CurrentUser } from './current-user';
import { SessionService } from './session.service';
import { MemoryTokenStore, TokenStore } from './token-store';

const profile = (admin?: boolean): UserProfile => ({
  id: 1,
  email: 'ana@example.com',
  name: null,
  createdAt: '2026-01-01T00:00:00Z',
  ...(admin === undefined ? {} : { admin }),
});

describe('SessionService.isAdmin', () => {
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

  it('é falso enquanto o perfil não foi carregado', () => {
    expect(TestBed.inject(SessionService).isAdmin()).toBe(false);
  });

  it('segue o indicador admin de /auth/me', () => {
    const session = TestBed.inject(SessionService);
    const currentUser = TestBed.inject(CurrentUser);

    currentUser.apply(profile(true));
    expect(session.isAdmin()).toBe(true);

    currentUser.apply(profile(false));
    expect(session.isAdmin()).toBe(false);
  });

  it('perfil sem o indicador (resposta antiga) não é administrador', () => {
    const session = TestBed.inject(SessionService);
    TestBed.inject(CurrentUser).apply(profile());
    expect(session.isAdmin()).toBe(false);
  });

  it('volta a falso ao esquecer o perfil (fim da sessão)', () => {
    const session = TestBed.inject(SessionService);
    const currentUser = TestBed.inject(CurrentUser);
    currentUser.apply(profile(true));

    currentUser.clear();

    expect(session.isAdmin()).toBe(false);
  });
});
