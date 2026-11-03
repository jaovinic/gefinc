const biometric = {
  checkBiometry: jest.fn(),
  authenticate: jest.fn(),
};
const systemBars = { setStyle: jest.fn(async () => undefined) };
const network = { getStatus: jest.fn(), addListener: jest.fn(async () => ({ remove: jest.fn() })) };
const app = { addListener: jest.fn(async () => ({ remove: jest.fn() })), minimizeApp: jest.fn(async () => undefined) };

jest.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: biometric,
  BiometryError: class BiometryError extends Error {
    constructor(
      message: string,
      public code: string,
    ) {
      super(message);
    }
  },
}));
jest.mock('@capacitor/core', () => ({ ...jest.requireActual('@capacitor/core'), SystemBars: systemBars }));
jest.mock('@capacitor/app', () => ({ App: app }));
jest.mock('@capacitor/network', () => ({ Network: network }));

import { BiometryError } from '@aparajita/capacitor-biometric-auth';
import { BiometricFailure, backButtonPort, biometricPort, networkPort, systemBarsChrome } from './native-ports';

describe('portas para os plugins nativos', () => {
  beforeEach(() => {
    biometric.checkBiometry.mockReset();
    biometric.authenticate.mockReset();
    delete (window as { __gefincNative?: unknown }).__gefincNative;
  });

  it('biometria: informa se está disponível no aparelho', async () => {
    biometric.checkBiometry.mockResolvedValue({ isAvailable: true });
    expect(await biometricPort().check()).toEqual({ available: true });

    biometric.checkBiometry.mockResolvedValue({ isAvailable: false, reason: 'Nenhuma digital cadastrada' });
    expect(await biometricPort().check()).toEqual({ available: false, reason: 'Nenhuma digital cadastrada' });
  });

  it('biometria: autentica com o texto do motivo e nunca permite a senha do aparelho no lugar', async () => {
    biometric.authenticate.mockResolvedValue(undefined);

    await biometricPort().authenticate('Desbloquear o GEFINC');

    expect(biometric.authenticate).toHaveBeenCalledWith(expect.objectContaining({ reason: 'Desbloquear o GEFINC', allowDeviceCredential: false }));
  });

  it.each([
    ['userCancel', 'cancelled'],
    ['systemCancel', 'cancelled'],
    ['appCancel', 'cancelled'],
    ['authenticationFailed', 'failed'],
    ['biometryLockout', 'lockout'],
    ['biometryNotAvailable', 'unavailable'],
    ['biometryNotEnrolled', 'unavailable'],
    ['noDeviceCredential', 'unavailable'],
    ['passcodeNotSet', 'unavailable'],
  ])('biometria: erro %s vira %s', async (code, expected) => {
    biometric.authenticate.mockRejectedValue(new BiometryError('x', code as never));

    await expect(biometricPort().authenticate('motivo')).rejects.toMatchObject({ code: expected });
    await expect(biometricPort().authenticate('motivo')).rejects.toBeInstanceOf(BiometricFailure);
  });

  it('biometria: erro desconhecido vira falha comum', async () => {
    biometric.authenticate.mockRejectedValue(new Error('algo'));

    await expect(biometricPort().authenticate('motivo')).rejects.toMatchObject({ code: 'failed' });
  });

  it('em desenvolvimento, os testes podem trocar os plugins por dublês (window.__gefincNative)', async () => {
    (window as { __gefincNative?: unknown }).__gefincNative = {
      biometric: { available: true, results: ['failed', 'ok'], calls: 0 },
    };

    expect(await biometricPort().check()).toEqual({ available: true });
    await expect(biometricPort().authenticate('x')).rejects.toMatchObject({ code: 'failed' });
    await expect(biometricPort().authenticate('x')).resolves.toBeUndefined();
    expect(biometric.authenticate).not.toHaveBeenCalled();
  });

  it('barras do sistema: tema escuro pede ícones claros (Dark) e o claro, ícones escuros (Light), nas duas barras', async () => {
    systemBars.setStyle.mockClear();
    await systemBarsChrome().sync('dark');
    await systemBarsChrome().sync('light');

    expect(systemBars.setStyle).toHaveBeenNthCalledWith(1, { style: 'DARK' });
    expect(systemBars.setStyle).toHaveBeenNthCalledWith(2, { style: 'LIGHT' });
    // sem `bar`: vale para a barra de status e para a de gestos
    expect(systemBars.setStyle.mock.calls.every(([options]) => !('bar' in (options as object)))).toBe(true);
  });

  it('barras do sistema: o dublê registra o estilo pedido sem chamar o plugin', async () => {
    systemBars.setStyle.mockClear();
    const doubles: { systemBars?: string[] } = {};
    (window as { __gefincNative?: unknown }).__gefincNative = doubles;

    await systemBarsChrome().sync('dark');
    await systemBarsChrome().sync('light');

    expect(doubles.systemBars).toEqual(['Dark', 'Light']);
    expect(systemBars.setStyle).not.toHaveBeenCalled();
  });

  it('botão Voltar: repassa canGoBack do plugin e minimiza o app (sem exitApp)', async () => {
    const listener = jest.fn();
    app.addListener.mockClear();
    await backButtonPort().onBack(listener);

    expect(app.addListener).toHaveBeenCalledWith('backButton', expect.any(Function));
    const handler = (app.addListener.mock.calls[0] as unknown as [string, (e: { canGoBack: boolean }) => void])[1];
    handler({ canGoBack: true });
    expect(listener).toHaveBeenCalledWith({ canGoBack: true });

    await backButtonPort().minimize();
    expect(app.minimizeApp).toHaveBeenCalledTimes(1);
  });

  it('botão Voltar: o dublê guarda os ouvintes e conta as minimizações', async () => {
    const back = { listeners: [] as ((e: { canGoBack: boolean }) => void)[], minimized: 0 };
    (window as { __gefincNative?: unknown }).__gefincNative = { back };
    const listener = jest.fn();

    await backButtonPort().onBack(listener);
    back.listeners[0]({ canGoBack: false });
    await backButtonPort().minimize();

    expect(listener).toHaveBeenCalledWith({ canGoBack: false });
    expect(back.minimized).toBe(1);
  });

  it('rede: sem dublê, lê a conexão e as mudanças do plugin', async () => {
    network.getStatus.mockResolvedValue({ connected: false, connectionType: 'none' });
    expect(networkPort().initial()).toBeNull();
    expect(await networkPort().status()).toBe(false);

    const listener = jest.fn();
    network.addListener.mockClear();
    await networkPort().onChange(listener);
    const handler = (network.addListener.mock.calls[0] as unknown as [string, (s: { connected: boolean }) => void])[1];
    expect(network.addListener.mock.calls[0][0]).toBe('networkStatusChange');
    handler({ connected: true });
    expect(listener).toHaveBeenCalledWith(true);
  });

  it('rede: o dublê simula conectado/desconectado sem tocar no plugin nem na rede do navegador', async () => {
    network.getStatus.mockClear();
    const double = { connected: false, listeners: [] as ((connected: boolean) => void)[] };
    (window as { __gefincNative?: unknown }).__gefincNative = { network: double };
    const listener = jest.fn();

    expect(networkPort().initial()).toBe(false);
    expect(await networkPort().status()).toBe(false);
    await networkPort().onChange(listener);
    double.connected = true;
    double.listeners.forEach((l) => l(true));

    expect(await networkPort().status()).toBe(true);
    expect(listener).toHaveBeenCalledWith(true);
    expect(network.getStatus).not.toHaveBeenCalled();
  });
});
