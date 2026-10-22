const biometric = {
  checkBiometry: jest.fn(),
  authenticate: jest.fn(),
};
const privacy = { enable: jest.fn(async () => undefined), disable: jest.fn(async () => undefined) };

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
jest.mock('@capacitor-community/privacy-screen', () => ({ PrivacyScreen: privacy }));

import { BiometryError } from '@aparajita/capacitor-biometric-auth';
import { BiometricFailure, biometricPort, privacyPort } from './native-ports';

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

  it('proteção da visão de apps recentes liga e desliga o plugin', async () => {
    await privacyPort().enable();
    await privacyPort().disable();

    expect(privacy.enable).toHaveBeenCalledTimes(1);
    expect(privacy.disable).toHaveBeenCalledTimes(1);
  });

  it('em desenvolvimento, os testes podem trocar os plugins por dublês (window.__gefincNative)', async () => {
    const calls: string[] = [];
    (window as { __gefincNative?: unknown }).__gefincNative = {
      biometric: { available: true, results: ['failed', 'ok'], calls: 0 },
      privacy: { enable: () => calls.push('on'), disable: () => calls.push('off') },
    };

    expect(await biometricPort().check()).toEqual({ available: true });
    await expect(biometricPort().authenticate('x')).rejects.toMatchObject({ code: 'failed' });
    await expect(biometricPort().authenticate('x')).resolves.toBeUndefined();
    await privacyPort().enable();
    expect(calls).toEqual(['on']);
    expect(biometric.authenticate).not.toHaveBeenCalled();
  });
});
