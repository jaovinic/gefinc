import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { API_BASE_URL, CurrentUser, NoticeService, messageFor, toProblem } from '@gefinc/ui-shared';
import { AdminApi } from './admin.api';

describe('AdminApi', () => {
  const clear = jest.fn();
  const load = jest.fn();
  const toast = jest.fn();
  let http: HttpTestingController;
  let api: AdminApi;
  let navigate: jest.SpyInstance;

  beforeEach(() => {
    clear.mockReset();
    load.mockReset();
    toast.mockReset();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1' },
        { provide: CurrentUser, useValue: { clear, load } },
        { provide: NoticeService, useValue: { toast } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(AdminApi);
    navigate = jest.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  function problem(status: number, code: string, extra: Record<string, unknown> = {}) {
    return { status, statusText: code, headers: { 'Content-Type': 'application/problem+json' }, body: { status, code, ...extra } };
  }

  it('setRole envia PUT com perfil e senha do administrador e termina sem corpo', () => {
    let done = false;
    api.setRole(7, 'ADMIN', 'minha-senha').subscribe(() => (done = true));

    const req = http.expectOne('/api/v1/admin/users/7/role');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ role: 'ADMIN', password: 'minha-senha' });
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(done).toBe(true);
    expect(clear).not.toHaveBeenCalled();
  });

  it('REAUTH_FAILED chega como 403 problem+json (nunca 401) e não derruba a sessão', () => {
    let error: unknown;
    api.setRole(7, 'USER', 'errada').subscribe({ error: (e: unknown) => (error = e) });

    const req = http.expectOne('/api/v1/admin/users/7/role');
    const { body, ...init } = problem(403, 'REAUTH_FAILED', { detail: 'Senha incorreta.' });
    req.flush(body, init);

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(403);
    expect(toProblem(error).code).toBe('REAUTH_FAILED');
    expect(messageFor(toProblem(error))).toBe('Senha incorreta.');
    expect(clear).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    [403, 'ROOT_PROTECTED'],
    [409, 'LAST_ADMIN'],
    [409, 'SELF_ACTION_FORBIDDEN'],
    [409, 'ACCOUNT_NOT_USABLE'],
    [422, 'VALIDATION_ERROR'],
  ])('recusa de regra %s %s é repassada à tela sem efeitos colaterais', (status, code) => {
    let error: unknown;
    api.setRole(7, 'USER', 'senha').subscribe({ error: (e: unknown) => (error = e) });

    const { body, ...init } = problem(status, code);
    http.expectOne('/api/v1/admin/users/7/role').flush(body, init);

    expect(toProblem(error)).toMatchObject({ status, code });
    expect(clear).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('403 FORBIDDEN (perfil retirado no meio da sessão) renova o perfil, avisa e volta para /', () => {
    let error: unknown;
    api.setRole(7, 'USER', 'senha').subscribe({ error: (e: unknown) => (error = e) });

    const { body, ...init } = problem(403, 'FORBIDDEN');
    http.expectOne('/api/v1/admin/users/7/role').flush(body, init);

    expect(clear).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(clear.mock.invocationCallOrder[0]).toBeLessThan(load.mock.invocationCallOrder[0]);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('administração'));
    expect(navigate).toHaveBeenCalledWith('/');
    expect(toProblem(error).code).toBe('FORBIDDEN');
  });

  it('falha de rede é repassada sem tratá-la como perda de acesso', () => {
    let error: unknown;
    api.setRole(7, 'USER', 'senha').subscribe({ error: (e: unknown) => (error = e) });

    http.expectOne('/api/v1/admin/users/7/role').error(new ProgressEvent('error'));

    expect(toProblem(error).status).toBe(0);
    expect(clear).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
