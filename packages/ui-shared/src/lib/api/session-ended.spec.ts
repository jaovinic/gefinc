import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL, CLIENT_KIND, LOGIN_REDIRECT, SESSION_ENDED } from './api.tokens';
import { CurrentUser } from './current-user';
import { SessionService } from './session.service';
import { MemoryTokenStore, TokenStore } from './token-store';

describe('SessionService - aviso de sessão encerrada', () => {
  const hook = jest.fn();
  const redirect = jest.fn();
  let session: SessionService;
  let http: HttpTestingController;

  beforeEach(() => {
    hook.mockReset();
    redirect.mockReset();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1' },
        { provide: CLIENT_KIND, useValue: 'mobile' },
        { provide: TokenStore, useClass: MemoryTokenStore },
        { provide: LOGIN_REDIRECT, useValue: redirect },
        { provide: SESSION_ENDED, useValue: hook },
      ],
    });
    session = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
  });

  it('sair avisa com o motivo "logout" (antes de a sessão local sumir)', () => {
    session.authenticated.set(true);
    let authenticatedWhenCalled: boolean | null = null;
    hook.mockImplementation(() => (authenticatedWhenCalled = session.authenticated()));

    session.logout().subscribe();
    http.expectOne('/api/v1/auth/logout').flush(null);

    expect(hook).toHaveBeenCalledWith('logout');
    expect(authenticatedWhenCalled).toBe(true);
    expect(session.authenticated()).toBe(false);
  });

  it('sessão perdida avisa com "expired" e leva ao login', () => {
    session.expire();

    expect(hook).toHaveBeenCalledWith('expired');
    expect(redirect).toHaveBeenCalled();
  });

  it('exclusão da conta avisa com "deleted"', () => {
    session.endLocalSession();

    expect(hook).toHaveBeenCalledWith('deleted');
  });

  it('um erro no aviso não impede de encerrar a sessão', () => {
    hook.mockImplementation(() => {
      throw new Error('falha ao limpar');
    });
    session.authenticated.set(true);

    session.endLocalSession();

    expect(session.authenticated()).toBe(false);
  });

  describe('perfil do atalho Minha conta', () => {
    const profile = { id: 1, email: 'ana@example.com', name: 'Ana', createdAt: '2026-01-01T00:00:00Z' };
    let currentUser: CurrentUser;

    beforeEach(() => {
      currentUser = TestBed.inject(CurrentUser);
      currentUser.apply(profile);
    });

    it('sair esquece o perfil', () => {
      session.logout().subscribe();
      http.expectOne('/api/v1/auth/logout').flush(null);

      expect(currentUser.profile()).toBeNull();
    });

    it('sessão perdida esquece o perfil e cancela a busca pendente', () => {
      currentUser.clear();
      currentUser.load();
      const pending = http.expectOne('/api/v1/auth/me');

      session.expire();

      expect(pending.cancelled).toBe(true);
      expect(currentUser.profile()).toBeNull();
    });

    it('encerrar só a sessão local (exclusão da conta) esquece o perfil', () => {
      session.endLocalSession();

      expect(currentUser.profile()).toBeNull();
    });

    it('entrar esquece o perfil do usuário anterior', () => {
      session.login({ email: 'bruno@example.com', password: 'senha-forte-123' }).subscribe();
      http.expectOne('/api/v1/auth/login').flush({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 });

      expect(currentUser.profile()).toBeNull();
    });
  });
});
