const app = { addListener: jest.fn(async (...args: [string, (state: { isActive: boolean }) => void]) => ({ remove: jest.fn(), args })) };
jest.mock('@capacitor/app', () => ({ App: app }));

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL, SessionService } from '@gefinc/ui-shared';
import { currentMonth } from '@gefinc/utils';
import { AppLockService } from '../lock/app-lock.service';
import { NetworkStatus } from './network-status';
import { OfflineWarmup, WARMUP_MIN_INTERVAL_MS } from './offline-warmup';
import { UserScope } from './user-scope';

const API = 'http://api.test/api/v1';
const month = currentMonth();
const IDLE_MS = 1_000;

const accounts = [
  { id: 1, name: 'Itaú', type: 'CHECKING', active: true, version: 0 },
  { id: 2, name: 'Nubank', type: 'CREDIT_CARD', active: true, version: 0 },
  { id: 3, name: 'Cartão antigo', type: 'CREDIT_CARD', active: false, version: 0 },
];

/** O que a API devolve para cada leitura do aquecimento (o corpo não importa, só que a próxima sai depois). */
const replyFor = (path: string): unknown => (path.startsWith('/accounts?') ? accounts : []);

describe('OfflineWarmup (aquece a cópia local com a rede)', () => {
  const authenticated = signal(true);
  const online = signal(true);
  const locked = signal(false);
  const user = { id: '7' as string | null };
  let http: HttpTestingController;
  let warmup: OfflineWarmup;

  const urlOf = (r: TestRequest) => r.request.urlWithParams.slice(API.length);

  function setup() {
    authenticated.set(false);
    online.set(true);
    locked.set(false);
    user.id = '7';
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 3, 12, 0));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API },
        { provide: SessionService, useValue: { authenticated } },
        { provide: NetworkStatus, useValue: { online } },
        { provide: AppLockService, useValue: { locked } },
        { provide: UserScope, useValue: { id: () => user.id } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    warmup = TestBed.inject(OfflineWarmup);
    TestBed.tick();
  }

  /** Deixa o aquecimento andar: responde a requisição aberta (sempre no máximo uma) até ele terminar. */
  async function drain(fail: Record<string, number> = {}) {
    const seen: string[] = [];
    await jest.advanceTimersByTimeAsync(IDLE_MS);
    for (let guard = 0; guard < 40; guard++) {
      const open = http.match(() => true);
      if (open.length === 0) {
        break;
      }
      expect(open).toHaveLength(1);
      const path = urlOf(open[0]);
      seen.push(path);
      const status = fail[path];
      if (status === 0) {
        open[0].error(new ProgressEvent('error'), { status: 0 });
      } else if (status) {
        open[0].flush({}, { status, statusText: 'Erro' });
      } else {
        open[0].flush(replyFor(path));
      }
      await jest.advanceTimersByTimeAsync(0);
    }
    return seen;
  }

  const FULL = [
    '/accounts?includeInactive=true',
    '/accounts?includeInactive=false',
    '/categories',
    '/balances',
    `/dashboard?month=${month}`,
    `/transactions?month=${month}&page=0&size=25`,
    `/cashflow?from=${month}&months=12`,
    `/accounts/2/invoices/${month}`,
    `/invoices/projection?from=${month}&months=12&accountId=2`,
    `/accounts/3/invoices/${month}`,
    `/invoices/projection?from=${month}&months=12&accountId=3`,
  ];

  beforeEach(() => {
    app.addListener.mockClear();
    setup();
  });
  afterEach(() => {
    http.verify();
    jest.useRealTimers();
  });

  it('depois do login, em ociosidade, busca uma requisição por vez as leituras que as abas usam (contas inclusive inativas, categorias, saldos, painel, lançamentos, fluxo e faturas por cartão)', async () => {
    authenticated.set(true);
    TestBed.tick();
    await jest.advanceTimersByTimeAsync(IDLE_MS - 1);
    http.expectNone(() => true);

    expect(await drain()).toEqual(FULL);
  });

  it('não roda sem login', async () => {
    online.set(false);
    TestBed.tick();
    online.set(true);
    TestBed.tick();
    await warmup.request();

    expect(await drain()).toEqual([]);
  });

  it('não roda sem conexão e roda quando ela volta', async () => {
    online.set(false);
    authenticated.set(true);
    TestBed.tick();
    expect(await drain()).toEqual([]);

    online.set(true);
    TestBed.tick();
    expect(await drain()).toEqual(FULL);
  });

  it('não roda enquanto o app está bloqueado e roda ao desbloquear', async () => {
    locked.set(true);
    authenticated.set(true);
    TestBed.tick();
    expect(await drain()).toEqual([]);

    locked.set(false);
    TestBed.tick();
    expect(await drain()).toEqual(FULL);
  });

  it('se a conexão cai ou o app bloqueia durante a espera, não dispara nada', async () => {
    authenticated.set(true);
    TestBed.tick();
    await jest.advanceTimersByTimeAsync(IDLE_MS / 2);
    locked.set(true);

    expect(await drain()).toEqual([]);
  });

  it('no máximo a cada 15 minutos: voltar ao primeiro plano antes disso não repete; depois, repete', async () => {
    authenticated.set(true);
    TestBed.tick();
    expect(await drain()).toEqual(FULL);

    await warmup.start();
    const onState = (app.addListener.mock.calls.find(([event]) => event === 'appStateChange') ?? [])[1] as (state: { isActive: boolean }) => void;
    await jest.advanceTimersByTimeAsync(WARMUP_MIN_INTERVAL_MS - 60_000);
    onState({ isActive: true });
    expect(await drain()).toEqual([]);

    await jest.advanceTimersByTimeAsync(60_000);
    onState({ isActive: false });
    expect(await drain()).toEqual([]);
    onState({ isActive: true });
    expect(await drain()).toEqual(FULL);
  });

  it('reconectar antes dos 15 minutos de um aquecimento completo não repete', async () => {
    authenticated.set(true);
    TestBed.tick();
    await drain();

    online.set(false);
    TestBed.tick();
    online.set(true);
    TestBed.tick();

    expect(await drain()).toEqual([]);
  });

  it('falha de rede interrompe o aquecimento e não gasta o intervalo: o próximo gatilho tenta de novo', async () => {
    authenticated.set(true);
    TestBed.tick();
    expect(await drain({ '/balances': 0 })).toEqual(FULL.slice(0, 4));

    online.set(false);
    TestBed.tick();
    online.set(true);
    TestBed.tick();
    expect(await drain()).toEqual(FULL);
  });

  it('falha do servidor numa leitura não impede as demais', async () => {
    authenticated.set(true);
    TestBed.tick();

    expect(await drain({ '/categories': 500 })).toEqual(FULL);
  });

  it('sair da conta zera o intervalo: entrar de novo aquece na hora', async () => {
    authenticated.set(true);
    TestBed.tick();
    await drain();

    authenticated.set(false);
    TestBed.tick();
    user.id = '8';
    authenticated.set(true);
    TestBed.tick();

    expect(await drain()).toEqual(FULL);
  });

  it('se o usuário muda no meio do aquecimento, para (a cópia é por usuário)', async () => {
    authenticated.set(true);
    TestBed.tick();
    await jest.advanceTimersByTimeAsync(IDLE_MS);
    const first = http.match(() => true);
    expect(first).toHaveLength(1);
    user.id = '9';
    first[0].flush(accounts);
    await jest.advanceTimersByTimeAsync(0);

    http.expectNone(() => true);
  });

  it('não corre em paralelo: gatilhos repetidos durante um aquecimento não duplicam leituras', async () => {
    authenticated.set(true);
    TestBed.tick();
    await jest.advanceTimersByTimeAsync(IDLE_MS);
    await warmup.request();
    await warmup.request();
    const open = http.match(() => true);
    expect(open).toHaveLength(1);
    open[0].flush(accounts);
    await jest.advanceTimersByTimeAsync(0);

    const rest = await drain();
    expect(rest).toEqual(FULL.slice(1));
  });
});
