const closeTopSheet = jest.fn(() => false);
jest.mock('@gefinc/ui-shared', () => ({ ...jest.requireActual('@gefinc/ui-shared'), closeTopSheet: () => closeTopSheet() }));

import { Location } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppLockService } from '../lock/app-lock.service';
import { BACK_BUTTON_PORT, BackButtonPort } from '../native/native-ports';
import { BackNavigation } from './back-navigation';

describe('BackNavigation (botão Voltar do Android)', () => {
  const locked = signal(false);
  let listener: ((event: { canGoBack: boolean }) => void) | undefined;
  const port: BackButtonPort = {
    onBack: jest.fn(async (fn) => void (listener = fn)),
    minimize: jest.fn(async () => undefined),
  };
  const location = { back: jest.fn() };

  async function setup(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: BACK_BUTTON_PORT, useValue: port },
        { provide: AppLockService, useValue: { locked } },
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    jest.spyOn(TestBed.inject(Location), 'back').mockImplementation(location.back);
    const navigate = jest.spyOn(router, 'navigateByUrl');
    const back = TestBed.inject(BackNavigation);
    await back.start();
    return { back, navigate };
  }
  const press = async (canGoBack: boolean) => {
    listener?.({ canGoBack });
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    locked.set(false);
    listener = undefined;
    closeTopSheet.mockReset().mockReturnValue(false);
    (port.minimize as jest.Mock).mockClear();
    location.back.mockClear();
  });

  it('registra o ouvinte do botão Voltar na porta', async () => {
    await setup('/');
    expect(port.onBack).toHaveBeenCalledTimes(1);
    expect(listener).toBeDefined();
  });

  it('com a tela de bloqueio ativa não faz nada: nem fecha painel, nem volta, nem minimiza', async () => {
    const { navigate } = await setup('/lancamentos');
    locked.set(true);
    await press(true);

    expect(closeTopSheet).not.toHaveBeenCalled();
    expect(location.back).not.toHaveBeenCalled();
    expect(port.minimize).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('com painel aberto fecha só o painel (menu Mais, confirmações, filtros)', async () => {
    closeTopSheet.mockReturnValue(true);
    const { navigate } = await setup('/lancamentos');
    await press(true);

    expect(closeTopSheet).toHaveBeenCalledTimes(1);
    expect(location.back).not.toHaveBeenCalled();
    expect(port.minimize).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('numa aba com histórico volta na navegação', async () => {
    await setup('/faturas');
    await press(true);

    expect(location.back).toHaveBeenCalledTimes(1);
    expect(port.minimize).not.toHaveBeenCalled();
  });

  it('sem histórico (aberto por lembrete) vai ao painel, sem deixar a tela anterior no histórico', async () => {
    const { navigate } = await setup('/lancamentos?mes=2026-11');
    await press(false);

    expect(location.back).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
    expect(port.minimize).not.toHaveBeenCalled();
  });

  it.each(['/', '/?x=1', '/login'])('na raiz (%s) minimiza o app em vez de sair', async (url) => {
    await setup(url);
    await press(true);

    expect(port.minimize).toHaveBeenCalledTimes(1);
    expect(location.back).not.toHaveBeenCalled();
  });

  it('o novo lançamento (/novo) volta para a tela de onde veio', async () => {
    await setup('/novo');
    await press(true);

    expect(location.back).toHaveBeenCalledTimes(1);
  });

  it('se minimizar o app falhar, o Voltar não lança nem gera rejeição não tratada', async () => {
    await setup('/');
    (port.minimize as jest.Mock).mockRejectedValueOnce(new Error('falha nativa'));
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      expect(() => listener?.({ canGoBack: false })).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(port.minimize).toHaveBeenCalledTimes(1);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
