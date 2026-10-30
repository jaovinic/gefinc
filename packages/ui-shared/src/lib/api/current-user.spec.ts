import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { API_BASE_URL } from './api.tokens';
import { CurrentUser, userDisplayName, userInitial } from './current-user';

const ME = '/api/v1/auth/me';
const profile = (name: string | null, email = 'ana.souza@example.com') => ({ id: 1, email, name, createdAt: '2026-01-01T00:00:00Z' });

describe('funções do nome de exibição', () => {
  it('userDisplayName: nome, depois a parte local do e-mail, depois nulo', () => {
    expect(userDisplayName('  Ana Souza ', 'ana@example.com')).toBe('Ana Souza');
    expect(userDisplayName(null, 'ana.souza@example.com')).toBe('ana.souza');
    expect(userDisplayName('   ', 'ana@example.com')).toBe('ana');
    expect(userDisplayName('', '')).toBeNull();
    expect(userDisplayName(undefined, null)).toBeNull();
    expect(userDisplayName(null, '@example.com')).toBeNull();
  });

  it('userInitial: inicial maiúscula do nome, do e-mail ou "?"', () => {
    expect(userInitial('ana', 'x@example.com')).toBe('A');
    expect(userInitial(null, 'bruno@example.com')).toBe('B');
    expect(userInitial('  carla', null)).toBe('C');
    expect(userInitial('', '')).toBe('?');
    expect(userInitial(undefined, undefined)).toBe('?');
  });
});

describe('CurrentUser', () => {
  let user: CurrentUser;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
        { provide: API_BASE_URL, useValue: '/api/v1' },
      ],
    });
    user = TestBed.inject(CurrentUser);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('começa vazio e sem falha', () => {
    expect(user.profile()).toBeNull();
    expect(user.failed()).toBe(false);
    expect(user.displayName()).toBeNull();
    expect(user.initial()).toBeNull();
  });

  it('carrega o perfil com uma única chamada, mesmo pedido duas vezes', () => {
    user.load();
    user.load();
    http.expectOne(ME).flush(profile('Ana Souza'));

    expect(user.displayName()).toBe('Ana Souza');
    expect(user.email()).toBe('ana.souza@example.com');
    expect(user.initial()).toBe('A');

    user.load();
    http.expectNone(ME);
  });

  it('sem nome usa a parte do e-mail antes do @', () => {
    user.load();
    http.expectOne(ME).flush(profile(null));

    expect(user.displayName()).toBe('ana.souza');
    expect(user.initial()).toBe('A');
  });

  it.each([
    [500, 'Internal Server Error'],
    [0, 'Unknown Error'],
  ])('falha com status %s marca "failed" e a próxima chamada tenta de novo', (status, statusText) => {
    user.load();
    http.expectOne(ME).flush({ code: 'ERRO' }, { status, statusText });

    expect(user.failed()).toBe(true);
    expect(user.profile()).toBeNull();

    user.load();
    http.expectOne(ME).flush(profile('Ana Souza'));
    expect(user.failed()).toBe(false);
    expect(user.displayName()).toBe('Ana Souza');
  });

  it('apply troca o nome mostrado e zera a falha', () => {
    user.load();
    http.expectOne(ME).flush(profile('Ana Souza'));
    user.apply(profile('Ana Maria'));

    expect(user.displayName()).toBe('Ana Maria');
    expect(user.failed()).toBe(false);
  });

  it('apply descarta a busca em andamento (resposta velha não sobrescreve o dado novo)', () => {
    user.load();
    const request = http.expectOne(ME);
    user.apply(profile('Ana Maria'));

    expect(request.cancelled).toBe(true);
    expect(user.displayName()).toBe('Ana Maria');
  });

  it('clear zera tudo e cancela a requisição pendente', () => {
    user.load();
    const request = http.expectOne(ME);
    user.clear();

    expect(request.cancelled).toBe(true);
    expect(user.profile()).toBeNull();
    expect(user.failed()).toBe(false);

    user.load();
    http.expectOne(ME).flush(profile('Bruno', 'bruno@example.com'));
    expect(user.displayName()).toBe('Bruno');
  });

  it('clear esquece o perfil carregado e a falha', () => {
    user.apply(profile('Ana Souza'));
    user.clear();
    expect(user.profile()).toBeNull();

    user.load();
    http.expectOne(ME).flush('x', { status: 500, statusText: 'x' });
    user.clear();
    expect(user.failed()).toBe(false);
  });

  it('não grava o perfil em armazenamento do navegador', () => {
    const set = jest.spyOn(Storage.prototype, 'setItem');
    user.load();
    http.expectOne(ME).flush(profile('Ana Souza'));

    expect(set).not.toHaveBeenCalled();
    set.mockRestore();
  });

  describe('nova tentativa automática', () => {
    const fail = (status = 0) => http.expectOne(ME).flush('x', { status, statusText: 'x' });

    it('falha e depois evento online: recarrega e preenche', () => {
      user.load();
      fail();
      expect(user.failed()).toBe(true);

      window.dispatchEvent(new Event('online'));
      http.expectOne(ME).flush(profile('Ana Souza'));
      expect(user.failed()).toBe(false);
      expect(user.displayName()).toBe('Ana Souza');
    });

    it('falha e depois navegação: tenta de novo uma vez', async () => {
      user.load();
      fail(500);

      await TestBed.inject(Router).navigateByUrl('/a');
      const request = http.expectOne(ME);
      await TestBed.inject(Router).navigateByUrl('/b');
      http.expectNone(ME);
      request.flush(profile('Ana Souza'));
      expect(user.displayName()).toBe('Ana Souza');
    });

    it('sucesso não refaz a busca', async () => {
      user.load();
      http.expectOne(ME).flush(profile('Ana Souza'));

      window.dispatchEvent(new Event('online'));
      await TestBed.inject(Router).navigateByUrl('/a');
      http.expectNone(ME);
    });

    it('sem falha anterior, online e navegação não buscam nada', async () => {
      window.dispatchEvent(new Event('online'));
      await TestBed.inject(Router).navigateByUrl('/a');
      http.expectNone(ME);
    });

    it('clear cancela a busca automática e esquece a falha', async () => {
      user.load();
      fail();
      window.dispatchEvent(new Event('online'));
      const request = http.expectOne(ME);
      user.clear();

      expect(request.cancelled).toBe(true);
      window.dispatchEvent(new Event('online'));
      await TestBed.inject(Router).navigateByUrl('/a');
      http.expectNone(ME);
      expect(user.profile()).toBeNull();
    });

    it.each([401, 403])('%s não entra em loop: online e navegação não insistem', async (status) => {
      user.load();
      fail(status);
      expect(user.failed()).toBe(true);

      window.dispatchEvent(new Event('online'));
      await TestBed.inject(Router).navigateByUrl('/a');
      http.expectNone(ME);
    });

    it('falhas seguidas só tentam de novo a cada evento', () => {
      user.load();
      fail();
      window.dispatchEvent(new Event('online'));
      fail();
      http.expectNone(ME);
      expect(user.failed()).toBe(true);
    });

    it('ao destruir o serviço os ouvintes saem', () => {
      user.load();
      fail();
      TestBed.resetTestingModule();
      window.dispatchEvent(new Event('online'));
      http.expectNone(ME);
    });
  });
});
