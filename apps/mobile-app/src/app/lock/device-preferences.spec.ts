const prefs = new Map<string, string>();

jest.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: jest.fn(async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null })),
    set: jest.fn(async ({ key, value }: { key: string; value: string }) => void prefs.set(key, value)),
    remove: jest.fn(async ({ key }: { key: string }) => void prefs.delete(key)),
  },
}));

import { TestBed } from '@angular/core/testing';
import { UserScope } from '../offline/user-scope';
import { DevicePreferences } from './device-preferences';

describe('DevicePreferences (bloqueio e lembretes, por usuário e por aparelho)', () => {
  let user: string | null;

  function service() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: UserScope, useValue: { id: () => user } }] });
    return TestBed.inject(DevicePreferences);
  }

  beforeEach(() => {
    prefs.clear();
    user = '7';
  });

  it('começa com tudo desligado: bloqueio em 1 minuto, lembretes às 9h', async () => {
    const p = service();
    await p.load();

    expect(p.lock()).toEqual({ enabled: false, timeoutMinutes: 1 });
    expect(p.reminders()).toEqual({ dueTomorrow: false, dueToday: false, overdue: false, hour: 9 });
  });

  it('atualiza e guarda; reabrir o app recupera', async () => {
    const p = service();
    await p.load();
    await p.setLock({ enabled: true, timeoutMinutes: 5 });
    await p.setReminders({ dueTomorrow: true, hour: 8 });

    const reopened = service();
    await reopened.load();

    expect(reopened.lock()).toEqual({ enabled: true, timeoutMinutes: 5 });
    expect(reopened.reminders()).toEqual({ dueTomorrow: true, dueToday: false, overdue: false, hour: 8 });
  });

  it('cada usuário tem as suas preferências', async () => {
    const p = service();
    await p.load();
    await p.setLock({ enabled: true });

    user = '8';
    await p.load();
    expect(p.lock().enabled).toBe(false);

    user = '7';
    await p.load();
    expect(p.lock().enabled).toBe(true);
  });

  it('valores inválidos guardados voltam ao padrão', async () => {
    prefs.set('gefinc.prefs.7', JSON.stringify({ lock: { enabled: 'sim', timeoutMinutes: 99 }, reminders: { hour: 31 } }));
    const p = service();
    await p.load();

    expect(p.lock()).toEqual({ enabled: false, timeoutMinutes: 1 });
    expect(p.reminders().hour).toBe(9);
  });

  it('clear apaga as preferências do usuário', async () => {
    const p = service();
    await p.load();
    await p.setLock({ enabled: true });

    await p.clear('7');

    expect(prefs.size).toBe(0);
    expect(p.lock().enabled).toBe(false);
  });
});
