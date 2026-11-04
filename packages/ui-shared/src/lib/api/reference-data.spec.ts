import { HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ACCOUNTS, API, CATEGORIES, configureHttpTesting } from '../../testing/testbed';
import { DATA_FRESHNESS } from './data-freshness';
import { ReferenceData } from './reference-data';

describe('ReferenceData', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('sem conexão, a recarga não estoura erro e mantém as listas que já tinha', () => {
    const { http, flushReference } = configureHttpTesting();
    const reference = TestBed.inject(ReferenceData);
    reference.refresh();
    flushReference();
    expect(reference.accounts()).toHaveLength(ACCOUNTS.length);

    reference.refresh();
    http.expectOne((r) => r.url === `${API}/accounts`).error(new ProgressEvent('error'), { status: 0 });
    http.expectOne((r) => r.url === `${API}/categories`).error(new ProgressEvent('error'), { status: 0 });

    expect(reference.accounts()).toHaveLength(ACCOUNTS.length);
    expect(reference.categories()).toHaveLength(CATEGORIES.length);
    expect(reference.loaded()).toBe(true);
  });

  it('a primeira carga que falha não marca as listas como carregadas', () => {
    const { http } = configureHttpTesting();
    const reference = TestBed.inject(ReferenceData);
    reference.refresh();
    http.expectOne((r) => r.url === `${API}/accounts`).error(new ProgressEvent('error'), { status: 0 });
    http.expectOne((r) => r.url === `${API}/categories`).error(new ProgressEvent('error'), { status: 0 });

    expect(reference.loaded()).toBe(false);
    expect(reference.accounts()).toEqual([]);
    expect(reference.accountsLoaded()).toBe(false);
    expect(reference.accountsError()).toContain('Sem conexão');
    expect(reference.accountsOffline()).toBe(true);
  });

  it('erro do servidor (5xx) nas contas guarda a mensagem de erro comum, sem marcar como falta de conexão', () => {
    const { http } = configureHttpTesting();
    const reference = TestBed.inject(ReferenceData);
    reference.refresh();
    http.expectOne((r) => r.url === `${API}/accounts`).flush({}, { status: 500, statusText: 'Server Error' });
    http.expectOne((r) => r.url === `${API}/categories`).flush({}, { status: 500, statusText: 'Server Error' });

    expect(reference.accountsError()).toContain('erro inesperado');
    expect(reference.accountsOffline()).toBe(false);
    expect(reference.accountsLoaded()).toBe(false);
  });

  it('uma carga que dá certo depois do erro limpa a mensagem', () => {
    const { http, flushReference } = configureHttpTesting();
    const reference = TestBed.inject(ReferenceData);
    reference.refresh();
    http.expectOne((r) => r.url === `${API}/accounts`).error(new ProgressEvent('error'), { status: 0 });
    http.expectOne((r) => r.url === `${API}/categories`).error(new ProgressEvent('error'), { status: 0 });
    reference.refresh();
    flushReference();

    expect(reference.accountsError()).toBeNull();
    expect(reference.accountsOffline()).toBe(false);
  });

  it('falha numa recarga, com contas já carregadas, não derruba a tela que usa as contas', () => {
    const { http, flushReference } = configureHttpTesting();
    const reference = TestBed.inject(ReferenceData);
    reference.refresh();
    flushReference();
    reference.refresh();
    http.expectOne((r) => r.url === `${API}/accounts`).error(new ProgressEvent('error'), { status: 0 });
    http.expectOne((r) => r.url === `${API}/categories`).error(new ProgressEvent('error'), { status: 0 });

    expect(reference.accountsLoaded()).toBe(true);
    expect(reference.accountsError()).toBeNull();
    expect(reference.accountsOffline()).toBe(false);
  });

  it('guarda de quando são as listas (cópia local) para as telas dizerem "na última sincronização"', () => {
    const synced = new Date(2026, 10, 3, 14, 30);
    const freshness = signal<Date | null>(synced);
    TestBed.configureTestingModule({ providers: [{ provide: DATA_FRESHNESS, useValue: freshness }] });
    const { http } = configureHttpTesting();
    const reference = TestBed.inject(ReferenceData);
    reference.refresh();
    http.expectOne((r) => r.url === `${API}/accounts`).flush(ACCOUNTS);
    http.expectOne((r) => r.url === `${API}/categories`).flush(CATEGORIES);

    expect(reference.staleSince()).toEqual(synced);
    freshness.set(null);
    reference.refresh();
    http.expectOne((r) => r.url === `${API}/accounts`).flush(ACCOUNTS);
    http.expectOne((r) => r.url === `${API}/categories`).flush(CATEGORIES);
    expect(reference.staleSince()).toBeNull();
  });

  describe('reset (fim da sessão)', () => {
    it('esquece contas, categorias, falha e data de sincronização, para o próximo usuário não ver as do anterior', () => {
      const synced = new Date(2026, 10, 3, 14, 30);
      TestBed.configureTestingModule({ providers: [{ provide: DATA_FRESHNESS, useValue: signal<Date | null>(synced) }] });
      const { http, flushReference } = configureHttpTesting();
      const reference = TestBed.inject(ReferenceData);
      reference.refresh();
      flushReference();
      expect(reference.accounts()).not.toEqual([]);
      expect(reference.staleSince()).toEqual(synced);

      reference.reset();

      expect(reference.accounts()).toEqual([]);
      expect(reference.categories()).toEqual([]);
      expect(reference.loaded()).toBe(false);
      expect(reference.accountsLoaded()).toBe(false);
      expect(reference.accountsError()).toBeNull();
      expect(reference.accountsOffline()).toBe(false);
      expect(reference.staleSince()).toBeNull();
      http.verify();
    });

    it('cargas em andamento são canceladas: a resposta do usuário anterior não volta a preencher as listas', () => {
      const { http } = configureHttpTesting();
      const reference = TestBed.inject(ReferenceData);
      reference.refresh();
      const accounts = http.expectOne((r) => r.url === `${API}/accounts`);
      const categories = http.expectOne((r) => r.url === `${API}/categories`);

      reference.reset();

      expect(accounts.cancelled).toBe(true);
      expect(categories.cancelled).toBe(true);
      expect(reference.accounts()).toEqual([]);
    });

    it('depois do reset, a lista volta a carregar normalmente para o novo usuário', () => {
      const { flushReference } = configureHttpTesting();
      const reference = TestBed.inject(ReferenceData);
      reference.refresh();
      flushReference();
      reference.reset();

      reference.refresh();
      flushReference();

      expect(reference.accountsLoaded()).toBe(true);
      expect(reference.accounts()).toHaveLength(ACCOUNTS.length);
    });
  });
});
