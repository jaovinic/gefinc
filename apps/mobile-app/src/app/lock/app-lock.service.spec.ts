import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BIOMETRIC_PORT, BiometricFailure, BiometricPort } from '../native/native-ports';
import { DevicePreferences } from './device-preferences';
import { AppLockService } from './app-lock.service';

describe('AppLockService (bloqueio por biometria)', () => {
  const lock = signal({ enabled: false, timeoutMinutes: 1 });
  const prefs = {
    lock,
    load: jest.fn(async () => undefined),
    setLock: jest.fn(async (patch: Partial<{ enabled: boolean; timeoutMinutes: number }>) => lock.update((l) => ({ ...l, ...patch }))),
  };
  const biometric = { check: jest.fn(), authenticate: jest.fn() } satisfies Record<keyof BiometricPort, jest.Mock>;
  let now: number;
  let service: AppLockService;

  beforeEach(() => {
    lock.set({ enabled: false, timeoutMinutes: 1 });
    prefs.load.mockClear();
    prefs.setLock.mockClear();
    biometric.check.mockReset().mockResolvedValue({ available: true });
    biometric.authenticate.mockReset().mockResolvedValue(undefined);
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: DevicePreferences, useValue: prefs },
        { provide: BIOMETRIC_PORT, useValue: biometric },
      ],
    });
    service = TestBed.inject(AppLockService);
  });
  afterEach(() => jest.restoreAllMocks());

  it('desligado por padrão: o app abre desbloqueado', async () => {
    await service.start();

    expect(service.locked()).toBe(false);
  });

  describe('ativar', () => {
    it('confirma com a biometria, liga o bloqueio', async () => {
      const result = await service.enable(5);

      expect(result).toEqual({ ok: true });
      expect(biometric.authenticate).toHaveBeenCalledTimes(1);
      expect(prefs.setLock).toHaveBeenCalledWith({ enabled: true, timeoutMinutes: 5 });
    });

    it('sem biometria cadastrada explica o motivo e não liga', async () => {
      biometric.check.mockResolvedValue({ available: false, reason: 'Nenhuma digital cadastrada' });

      const result = await service.enable(1);

      expect(result).toEqual({ ok: false, reason: 'unavailable', message: 'Nenhuma digital cadastrada' });
      expect(prefs.setLock).not.toHaveBeenCalled();
      expect(biometric.authenticate).not.toHaveBeenCalled();
    });

    it('se o usuário cancelar ou falhar na confirmação, não liga', async () => {
      biometric.authenticate.mockRejectedValue(new BiometricFailure('cancelled'));

      expect(await service.enable(1)).toMatchObject({ ok: false, reason: 'cancelled' });
      expect(prefs.setLock).not.toHaveBeenCalled();
    });
  });

  describe('bloquear e desbloquear', () => {
    beforeEach(() => lock.set({ enabled: true, timeoutMinutes: 1 }));

    it('abre bloqueado (início do app)', async () => {
      await service.start();

      expect(service.locked()).toBe(true);
    });

    it('desbloqueia com a biometria', async () => {
      await service.start();

      await service.unlock();

      expect(service.locked()).toBe(false);
      expect(service.failures()).toBe(0);
    });

    it.each([
      [0, 0, true],
      [1, 30_000, false],
      [1, 61_000, true],
      [5, 4 * 60_000, false],
      [5, 5 * 60_000 + 1, true],
    ])('tempo de bloqueio %s min: voltar do segundo plano depois de %s ms bloqueia = %s', async (minutes, away, expected) => {
      lock.set({ enabled: true, timeoutMinutes: minutes });
      await service.start();
      await service.unlock();
      now += 5_000; // passada a janela do diálogo da biometria

      service.onBackgrounded();
      now += away;
      await service.onForegrounded();

      expect(service.locked()).toBe(expected);
    });

    it('o próprio diálogo da digital manda o app ao segundo plano e de volta: isso não pode bloquear de novo (ciclo sem fim)', async () => {
      lock.set({ enabled: true, timeoutMinutes: 0 }); // "na hora": o caso em que qualquer volta bloquearia
      await service.start();
      biometric.authenticate.mockImplementationOnce(async () => {
        // o Android pausa e retoma a atividade por causa do diálogo da biometria
        service.onBackgrounded();
        now += 800;
        await service.onForegrounded();
      });

      await service.unlock();
      // e o evento de "voltou ao primeiro plano" pode chegar logo depois de o diálogo fechar
      now += 300;
      service.onBackgrounded();
      now += 300;
      await service.onForegrounded();

      expect(service.locked()).toBe(false);
    });

    it('depois do diálogo, sair do app de verdade volta a bloquear', async () => {
      lock.set({ enabled: true, timeoutMinutes: 0 });
      await service.start();
      await service.unlock();
      now += 5_000; // passada a janela do diálogo

      service.onBackgrounded();
      now += 100;
      await service.onForegrounded();

      expect(service.locked()).toBe(true);
    });

    it('falha de reconhecimento conta e avisa; cancelamento não conta', async () => {
      await service.start();

      biometric.authenticate.mockRejectedValueOnce(new BiometricFailure('failed'));
      await service.unlock();
      expect(service.failures()).toBe(1);
      expect(service.message()).toBe('Biometria não reconhecida. Tente de novo.');
      expect(service.locked()).toBe(true);

      biometric.authenticate.mockRejectedValueOnce(new BiometricFailure('cancelled'));
      await service.unlock();
      expect(service.failures()).toBe(1);
      expect(service.message()).toBeNull();
    });

    it('bloqueio por muitas tentativas pede a senha', async () => {
      await service.start();
      biometric.authenticate.mockRejectedValueOnce(new BiometricFailure('lockout'));

      await service.unlock();

      expect(service.locked()).toBe(true);
      expect(service.message()).toContain('senha');
      expect(service.passwordRequired()).toBe(true);
    });

    it('biometria removida do aparelho: desliga o bloqueio, avisa o motivo e exige a senha', async () => {
      await service.start();
      service.onBackgrounded();
      biometric.check.mockResolvedValue({ available: false });

      await service.onForegrounded();

      expect(prefs.setLock).toHaveBeenCalledWith({ enabled: false });
      expect(service.passwordRequired()).toBe(true);
      expect(service.message()).toContain('biometria');
    });
  });

  describe('desligar', () => {
    beforeEach(async () => {
      lock.set({ enabled: true, timeoutMinutes: 1 });
      await service.start();
      await service.unlock();
    });

    it('exige confirmar com a biometria', async () => {
      const result = await service.disable();

      expect(result).toEqual({ ok: true });
      expect(prefs.setLock).toHaveBeenCalledWith({ enabled: false });
    });

    it('sem confirmação, continua ligado', async () => {
      biometric.authenticate.mockRejectedValue(new BiometricFailure('failed'));

      const result = await service.disable();

      expect(result).toMatchObject({ ok: false });
      expect(lock().enabled).toBe(true);
    });
  });
});
