import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { DueSummaryApi } from '@gefinc/ui-shared';
import { DevicePreferences } from '../lock/device-preferences';
import { NOTIFICATIONS_PORT } from '../native/native-ports';
import { RemindersService } from './reminders.service';

describe('RemindersService (lembretes locais de vencimento)', () => {
  const reminders = signal({ dueTomorrow: false, dueToday: false, overdue: false, hour: 9 });
  const prefs = {
    reminders,
    setReminders: jest.fn(async (patch: object) => reminders.update((r) => ({ ...r, ...patch }))),
  };
  const port = {
    permission: jest.fn(async (): Promise<string> => 'granted'),
    requestPermission: jest.fn(async (): Promise<string> => 'granted'),
    cancelAll: jest.fn(async () => undefined),
    schedule: jest.fn(async (_items: unknown[]) => undefined),
    onTap: jest.fn(async (_listener: (route: string) => void) => undefined),
  };
  const get = jest.fn();
  const navigateByUrl = jest.fn();
  let service: RemindersService;

  beforeEach(() => {
    reminders.set({ dueTomorrow: false, dueToday: false, overdue: false, hour: 9 });
    prefs.setReminders.mockClear();
    port.permission.mockReset().mockResolvedValue('granted');
    port.requestPermission.mockReset().mockResolvedValue('granted');
    port.cancelAll.mockClear();
    port.schedule.mockClear();
    port.onTap.mockClear();
    get.mockReset().mockReturnValue(of({ days: [{ date: '2099-01-02', items: 2, invoices: 0 }], overdue: { items: 0, invoices: 0 } }));
    navigateByUrl.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: DevicePreferences, useValue: prefs },
        { provide: NOTIFICATIONS_PORT, useValue: port },
        { provide: DueSummaryApi, useValue: { get } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    service = TestBed.inject(RemindersService);
  });
  afterEach(() => jest.useRealTimers());

  it('com tudo desligado, cancela os avisos e não consulta o servidor', async () => {
    await service.reschedule();

    expect(port.cancelAll).toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(port.schedule).not.toHaveBeenCalled();
    expect(service.scheduledCount()).toBe(0);
  });

  it('com um tipo ligado, consulta os próximos 14 dias, cancela o que havia e agenda o plano', async () => {
    reminders.set({ dueTomorrow: true, dueToday: false, overdue: true, hour: 8 });
    get.mockReturnValue(of({ days: [], overdue: { items: 3, invoices: 0 } }));

    await service.reschedule();

    const [from, to] = get.mock.calls[0];
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000).toBe(14);
    expect(port.cancelAll).toHaveBeenCalledTimes(1);
    const scheduled = port.schedule.mock.calls[0][0] as { body: string }[];
    expect(scheduled.length).toBeGreaterThan(0);
    expect(scheduled[0].body).toBe('3 contas atrasadas');
    expect(service.scheduledCount()).toBe(scheduled.length);
  });

  it('sem permissão do sistema não agenda nada', async () => {
    reminders.set({ dueTomorrow: true, dueToday: false, overdue: false, hour: 9 });
    port.permission.mockResolvedValue('denied');

    await service.reschedule();

    expect(get).not.toHaveBeenCalled();
    expect(port.schedule).not.toHaveBeenCalled();
  });

  it('se não conseguir consultar (sem conexão), mantém os avisos já agendados', async () => {
    reminders.set({ dueTomorrow: true, dueToday: false, overdue: false, hour: 9 });
    get.mockReturnValue(throwError(() => new Error('offline')));

    await service.reschedule();

    expect(port.cancelAll).not.toHaveBeenCalled();
    expect(port.schedule).not.toHaveBeenCalled();
  });

  describe('ligar e desligar tipos de aviso', () => {
    it('só pede a permissão do sistema ao ligar o primeiro tipo; concedida, liga e reagenda', async () => {
      port.permission.mockResolvedValue('prompt');
      port.requestPermission.mockImplementation(async () => {
        port.permission.mockResolvedValue('granted'); // depois de concedida, o sistema passa a responder "granted"
        return 'granted';
      });

      const result = await service.setKind('dueTomorrow', true);

      expect(port.requestPermission).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ ok: true });
      expect(prefs.setReminders).toHaveBeenCalledWith({ dueTomorrow: true });
      expect(get).toHaveBeenCalled();
    });

    it('permissão negada explica como liberar nas configurações e não liga', async () => {
      port.permission.mockResolvedValue('denied');

      const result = await service.setKind('dueToday', true);

      expect(result).toMatchObject({ ok: false });
      expect((result as { message: string }).message).toContain('configurações do aparelho');
      expect(prefs.setReminders).not.toHaveBeenCalled();
      expect(port.requestPermission).not.toHaveBeenCalled();
    });

    it('desligar o último tipo cancela todos os avisos', async () => {
      reminders.set({ dueTomorrow: true, dueToday: false, overdue: false, hour: 9 });

      await service.setKind('dueTomorrow', false);

      expect(prefs.setReminders).toHaveBeenCalledWith({ dueTomorrow: false });
      expect(port.cancelAll).toHaveBeenCalled();
      expect(port.schedule).not.toHaveBeenCalled();
    });

    it('mudar o horário reagenda na hora', async () => {
      reminders.set({ dueTomorrow: true, dueToday: false, overdue: false, hour: 9 });

      await service.setHour(20);

      expect(prefs.setReminders).toHaveBeenCalledWith({ hour: 20 });
      expect(port.cancelAll).toHaveBeenCalled();
    });
  });

  it('várias mudanças seguidas (pagar, enviar pendências) viram um único reagendamento', async () => {
    jest.useFakeTimers();
    reminders.set({ dueTomorrow: true, dueToday: false, overdue: false, hour: 9 });

    service.scheduleSoon();
    service.scheduleSoon();
    service.scheduleSoon();
    expect(get).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1_600);

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('tocar no aviso abre a lista de lançamentos filtrada', async () => {
    await service.start();
    const listener = port.onTap.mock.calls[0][0] as (route: string) => void;

    listener('/lancamentos?status=PENDING&month=2026-11');

    expect(navigateByUrl).toHaveBeenCalledWith('/lancamentos?status=PENDING&month=2026-11');
  });

  it('cancelAll (ao sair da conta) apaga os avisos e zera a contagem', async () => {
    await service.cancelAll();

    expect(port.cancelAll).toHaveBeenCalled();
    expect(service.scheduledCount()).toBe(0);
  });
});
