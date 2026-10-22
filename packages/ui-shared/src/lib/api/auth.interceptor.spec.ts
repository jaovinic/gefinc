import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL, CLIENT_KIND, ClientKind, LOGIN_REDIRECT } from './api.tokens';
import { authInterceptor } from './auth.interceptor';
import { DraftService } from './draft.service';
import { NoticeService } from './notice.service';
import { SessionService } from './session.service';
import { MemoryTokenStore, StoredTokens, TokenStore } from './token-store';

const BASE = '/api/v1';

class FakeMobileStore extends TokenStore {
  access: string | null = 'acesso-1';
  refresh: string | null = 'refresh-1';
  accessToken() {
    return this.access;
  }
  refreshToken() {
    return this.refresh;
  }
  save(tokens: StoredTokens) {
    this.access = tokens.accessToken;
    this.refresh = tokens.refreshToken ?? this.refresh;
  }
  clear() {
    this.access = null;
    this.refresh = null;
  }
}

function setup(kind: ClientKind, store: TokenStore) {
  const redirect = jest.fn();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: BASE },
      { provide: CLIENT_KIND, useValue: kind },
      { provide: TokenStore, useValue: store },
      { provide: LOGIN_REDIRECT, useValue: redirect },
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    ctrl: TestBed.inject(HttpTestingController),
    session: TestBed.inject(SessionService),
    redirect,
  };
}

describe('authInterceptor', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    sessionStorage.clear();
  });

  it('web: envia X-Client e cookies, e o Authorization quando há token', () => {
    const store = new MemoryTokenStore();
    store.save({ accessToken: 'abc' });
    const { http, ctrl } = setup('web', store);

    http.get(`${BASE}/accounts`).subscribe();

    const req = ctrl.expectOne(`${BASE}/accounts`);
    expect(req.request.headers.get('X-Client')).toBe('web');
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc');
    expect(req.request.withCredentials).toBe(true);
    req.flush([]);
  });

  it('mobile: não envia X-Client nem cookies', () => {
    const { http, ctrl } = setup('mobile', new FakeMobileStore());

    http.get(`${BASE}/accounts`).subscribe();

    const req = ctrl.expectOne(`${BASE}/accounts`);
    expect(req.request.headers.has('X-Client')).toBe(false);
    expect(req.request.withCredentials).toBe(false);
    expect(req.request.headers.get('Authorization')).toBe('Bearer acesso-1');
    req.flush([]);
  });

  it('não mexe em requisições para outros endereços', () => {
    const { http, ctrl } = setup('web', new MemoryTokenStore());

    http.get('https://outro.example/x').subscribe();

    const req = ctrl.expectOne('https://outro.example/x');
    expect(req.request.headers.has('X-Client')).toBe(false);
    req.flush({});
  });

  it('401: renova uma vez e repete a requisição com o novo token', () => {
    const store = new FakeMobileStore();
    const { http, ctrl } = setup('mobile', store);
    let result: unknown;

    http.get(`${BASE}/accounts`).subscribe((r) => (result = r));
    ctrl.expectOne(`${BASE}/accounts`).flush({}, { status: 401, statusText: 'Unauthorized' });

    const refresh = ctrl.expectOne(`${BASE}/auth/refresh`);
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-1' });
    refresh.flush({ accessToken: 'acesso-2', refreshToken: 'refresh-2', expiresIn: 900 });

    const retry = ctrl.expectOne(`${BASE}/accounts`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer acesso-2');
    retry.flush([{ id: 1 }]);
    expect(result).toEqual([{ id: 1 }]);
  });

  it('401 simultâneos compartilham uma única renovação', () => {
    const { http, ctrl } = setup('mobile', new FakeMobileStore());

    http.get(`${BASE}/accounts`).subscribe();
    http.get(`${BASE}/categories`).subscribe();
    ctrl.expectOne(`${BASE}/accounts`).flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne(`${BASE}/categories`).flush({}, { status: 401, statusText: 'Unauthorized' });

    ctrl.expectOne(`${BASE}/auth/refresh`).flush({ accessToken: 'acesso-2', expiresIn: 900 });
    ctrl.expectOne(`${BASE}/accounts`).flush([]);
    ctrl.expectOne(`${BASE}/categories`).flush([]);
  });

  it('renovação recusada: guarda rascunhos, encerra a sessão e leva ao login', () => {
    const store = new FakeMobileStore();
    const { http, ctrl, session, redirect } = setup('mobile', store);
    TestBed.inject(DraftService).register('lancamento', () => ({ descricao: 'Mercado' }));
    let status = 0;

    http.get(`${BASE}/accounts`).subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne(`${BASE}/accounts`).flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne(`${BASE}/auth/refresh`).flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(session.authenticated()).toBe(false);
    expect(store.access).toBeNull();
    expect(TestBed.inject(DraftService).take('lancamento')).toEqual({ descricao: 'Mercado' });
  });

  it('401 em /auth/login (senha errada) não tenta renovar', () => {
    const { http, ctrl } = setup('web', new MemoryTokenStore());
    let status = 0;

    http.post(`${BASE}/auth/login`, {}).subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne(`${BASE}/auth/login`).flush({ code: 'INVALID_CREDENTIALS' }, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    ctrl.expectNone(`${BASE}/auth/refresh`);
  });

  it('409 STALE_VERSION avisa o usuário e sobe o contador de recarga', () => {
    const { http, ctrl } = setup('web', new MemoryTokenStore());
    const notices = TestBed.inject(NoticeService);

    http.put(`${BASE}/accounts/1`, {}).subscribe({ error: () => undefined });
    ctrl.expectOne(`${BASE}/accounts/1`).flush({ code: 'STALE_VERSION' }, { status: 409, statusText: 'Conflict' });

    expect(notices.message()).toContain('alterado em outro dispositivo');
    expect(notices.staleVersionCount()).toBe(1);
  });

  it('409 de outro motivo não dispara o aviso de conflito', () => {
    const { http, ctrl } = setup('web', new MemoryTokenStore());
    const notices = TestBed.inject(NoticeService);

    http.delete(`${BASE}/accounts/1`).subscribe({ error: () => undefined });
    ctrl.expectOne(`${BASE}/accounts/1`).flush({ code: 'ACCOUNT_IN_USE' }, { status: 409, statusText: 'Conflict' });

    expect(notices.message()).toBeNull();
  });
});
