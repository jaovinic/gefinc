import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL, CLIENT_KIND, LOGIN_REDIRECT, SESSION_ENDED } from './api.tokens';
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
});
