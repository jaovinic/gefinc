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

  describe('listUsers', () => {
    const empty = { content: [], page: 0, size: 25, totalElements: 0, counts: { active: 0, suspended: 0, deletionPending: 0, admin: 0 } };

    it('só manda os parâmetros preenchidos', () => {
      api.listUsers({ q: '  joão  ', status: 'SUSPENDED', sort: 'lastAccessAt', dir: 'asc', page: 2, size: 25 }).subscribe();

      const req = http.expectOne((r) => r.url === '/api/v1/admin/users');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('q')).toBe('joão');
      expect(req.request.params.get('status')).toBe('SUSPENDED');
      expect(req.request.params.get('sort')).toBe('lastAccessAt');
      expect(req.request.params.get('dir')).toBe('asc');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('size')).toBe('25');
      req.flush(empty);
    });

    it('sem filtros não manda q nem status; busca só com espaços também não', () => {
      api.listUsers({ q: '   ', page: 0 }).subscribe();

      const req = http.expectOne((r) => r.url === '/api/v1/admin/users');
      expect(req.request.params.keys()).toEqual(['page']);
      req.flush(empty);
    });

    it('sem parâmetros nenhum vai na URL', () => {
      api.listUsers().subscribe();

      const req = http.expectOne('/api/v1/admin/users');
      expect(req.request.params.keys()).toEqual([]);
      req.flush(empty);
    });

    it('mapeia o problem+json da recusa (422) sem tratar como sessão expirada', () => {
      let error: unknown;
      api.listUsers({ size: 101 }).subscribe({ error: (e: unknown) => (error = e) });

      const { body, ...init } = problem(422, 'VALIDATION_ERROR', { errors: [{ field: 'size', message: 'Tamanho inválido.' }] });
      http.expectOne((r) => r.url === '/api/v1/admin/users').flush(body, init);

      expect(toProblem(error)).toMatchObject({ status: 422, code: 'VALIDATION_ERROR', fieldErrors: { size: 'Tamanho inválido.' } });
      expect(clear).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('403 FORBIDDEN (perfil retirado) renova o perfil e volta para /; não vira "sessão expirada"', () => {
      let error: unknown;
      api.listUsers().subscribe({ error: (e: unknown) => (error = e) });

      const { body, ...init } = problem(403, 'FORBIDDEN');
      http.expectOne('/api/v1/admin/users').flush(body, init);

      expect(clear).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith('/');
      expect(toProblem(error)).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    });
  });

  describe('getUser', () => {
    it('pede o detalhe pelo id', () => {
      let id = 0;
      api.getUser(7).subscribe((detail) => (id = detail.id));

      const req = http.expectOne('/api/v1/admin/users/7');
      expect(req.request.method).toBe('GET');
      req.flush({ id: 7, email: 'a@teste.com', createdAt: '2026-11-14T00:00:00Z', role: 'USER', suspended: false, deletionPending: false, openSessions: 0, protected: false, recentActions: [] });
      expect(id).toBe(7);
    });

    it('404 chega à tela como problema NOT_FOUND, sem efeitos colaterais', () => {
      let error: unknown;
      api.getUser(999).subscribe({ error: (e: unknown) => (error = e) });

      const { body, ...init } = problem(404, 'NOT_FOUND');
      http.expectOne('/api/v1/admin/users/999').flush(body, init);

      expect(toProblem(error)).toMatchObject({ status: 404, code: 'NOT_FOUND' });
      expect(clear).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('sessões, suspensão e bloqueio de login', () => {
    it('lista as sessões do usuário', () => {
      let count = 0;
      api.listSessions(7).subscribe((sessions) => (count = sessions.length));

      const req = http.expectOne('/api/v1/admin/users/7/sessions');
      expect(req.request.method).toBe('GET');
      req.flush([{ id: 'a', startedAt: '2026-11-14T00:00:00Z', lastUsedAt: '2026-11-14T00:00:00Z', current: false }]);
      expect(count).toBe(1);
    });

    it('encerra uma sessão e todas', () => {
      api.revokeSession(7, 'abc-1').subscribe();
      const one = http.expectOne('/api/v1/admin/users/7/sessions/abc-1');
      expect(one.request.method).toBe('DELETE');
      one.flush(null, { status: 204, statusText: 'No Content' });

      api.revokeAllSessions(7).subscribe();
      const all = http.expectOne('/api/v1/admin/users/7/sessions');
      expect(all.request.method).toBe('DELETE');
      all.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('suspende com o motivo no corpo', () => {
      api.suspend(7, 'Uso indevido').subscribe();

      const req = http.expectOne('/api/v1/admin/users/7/suspend');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ reason: 'Uso indevido' });
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('reativa e retira o bloqueio de login', () => {
      api.reactivate(7).subscribe();
      const reactivate = http.expectOne('/api/v1/admin/users/7/reactivate');
      expect(reactivate.request.method).toBe('POST');
      reactivate.flush(null, { status: 204, statusText: 'No Content' });

      api.clearLoginLock(7).subscribe();
      const lock = http.expectOne('/api/v1/admin/users/7/login-lock');
      expect(lock.request.method).toBe('DELETE');
      lock.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('recusa de regra (409 SELF_ACTION_FORBIDDEN) chega à tela sem virar sessão expirada', () => {
      let error: unknown;
      api.suspend(7, 'x').subscribe({ error: (e: unknown) => (error = e) });

      const { body, ...init } = problem(409, 'SELF_ACTION_FORBIDDEN');
      http.expectOne('/api/v1/admin/users/7/suspend').flush(body, init);

      expect(toProblem(error)).toMatchObject({ status: 409, code: 'SELF_ACTION_FORBIDDEN' });
      expect(clear).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
