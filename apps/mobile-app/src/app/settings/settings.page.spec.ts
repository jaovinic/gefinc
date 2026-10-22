import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL, CLIENT_KIND, MemoryTokenStore, SessionService, TokenStore } from '@gefinc/ui-shared';
import { LogoutAction } from '../core/logout';
import { AppLockService } from '../lock/app-lock.service';
import { DevicePreferences } from '../lock/device-preferences';
import { SettingsPage } from './settings.page';

describe('Minha conta (app móvel)', () => {
  const logout = { run: jest.fn() };
  const lockPrefs = signal({ enabled: false, timeoutMinutes: 1 });
  const lockService = {
    enable: jest.fn(async (): Promise<unknown> => ({ ok: true })),
    disable: jest.fn(async (): Promise<unknown> => ({ ok: true })),
  };

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api/v1' },
        { provide: CLIENT_KIND, useValue: 'mobile' },
        { provide: TokenStore, useClass: MemoryTokenStore },
        { provide: LogoutAction, useValue: logout },
        { provide: DevicePreferences, useValue: { lock: lockPrefs, reminders: signal({ dueTomorrow: false, dueToday: false, overdue: false, hour: 9 }) } },
        { provide: AppLockService, useValue: lockService },
      ],
    });
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
  }

  beforeEach(() => {
    logout.run.mockReset();
    lockPrefs.set({ enabled: false, timeoutMinutes: 1 });
    lockService.enable.mockClear().mockResolvedValue({ ok: true });
    lockService.disable.mockClear().mockResolvedValue({ ok: true });
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('tem um único título da página e o botão de sair', () => {
    const { el } = setup();

    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(el.querySelector('h1')?.textContent).toContain('Minha conta');
    const sair = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Sair') as HTMLButtonElement;
    sair.click();
    expect(logout.run).toHaveBeenCalledTimes(1);
  });

  it('inclui a exclusão da conta, que exige a senha e mostra o prazo de 30 dias', () => {
    const { el } = setup();

    expect(Array.from(el.querySelectorAll('h2')).map((h) => h.textContent?.trim())).toContain('Excluir minha conta');
    expect(el.textContent).toContain('30 dias');
    expect(el.querySelector('#password')).not.toBeNull();
  });

  it('exclusão agendada informa a data limite e encerra a sessão local', () => {
    const { el, fixture, http } = setup();
    const session = TestBed.inject(SessionService);
    session.authenticated.set(true);
    const input = el.querySelector('#password') as HTMLInputElement;
    input.value = 'senha-forte-123';
    input.dispatchEvent(new Event('input'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    http.expectOne('http://api.test/api/v1/auth/account-deletion').flush({ deletionDate: '2026-12-10' }, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();

    expect(el.querySelector('[role="status"]')?.textContent).toContain('10/12/2026');
    expect(session.authenticated()).toBe(false);
  });

  it('erro de senha na exclusão aparece em português sem encerrar a sessão', () => {
    const { el, fixture, http } = setup();
    const session = TestBed.inject(SessionService);
    session.authenticated.set(true);
    const input = el.querySelector('#password') as HTMLInputElement;
    input.value = 'errada-errada';
    input.dispatchEvent(new Event('input'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    http.expectOne('http://api.test/api/v1/auth/account-deletion').flush({ code: 'INVALID_CREDENTIALS' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('E-mail ou senha incorretos.');
    expect(session.authenticated()).toBe(true);
  });

  describe('bloqueio por biometria', () => {
    const toggle = (el: HTMLElement) => el.querySelector('input[role="switch"][aria-label="Bloquear o app com biometria"]') as HTMLInputElement;
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    it('vem desligado, com o tempo de bloqueio e o aviso sobre capturas de tela no Android', () => {
      const { el } = setup();

      expect(toggle(el).checked).toBe(false);
      const options = Array.from(el.querySelectorAll('select[aria-label="Bloquear depois de"] option')).map((o) => o.textContent?.trim());
      expect(options).toEqual(['Na hora', '1 minuto', '5 minutos']);
      expect(el.textContent).toContain('capturas de tela');
    });

    it('ativar pede a biometria com o tempo escolhido e mostra o resultado', async () => {
      const { el, fixture } = setup();
      const select = el.querySelector('select[aria-label="Bloquear depois de"]') as HTMLSelectElement;
      select.value = '5';
      select.dispatchEvent(new Event('change'));

      toggle(el).click();
      await flush();
      fixture.detectChanges();

      expect(lockService.enable).toHaveBeenCalledWith(5);
    });

    it('sem biometria cadastrada explica como habilitar e não liga', async () => {
      lockService.enable.mockResolvedValue({ ok: false, reason: 'unavailable', message: 'Cadastre uma digital nas configurações do aparelho.' });
      const { el, fixture } = setup();

      toggle(el).click();
      await flush();
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="lock-feedback"]')?.textContent).toContain('Cadastre uma digital');
    });

    it('com o bloqueio ligado, desligar pede confirmação pela biometria', async () => {
      lockPrefs.set({ enabled: true, timeoutMinutes: 1 });
      const { el, fixture } = setup();
      expect(toggle(el).checked).toBe(true);

      toggle(el).click();
      await flush();
      fixture.detectChanges();

      expect(lockService.disable).toHaveBeenCalled();
    });
  });
});
