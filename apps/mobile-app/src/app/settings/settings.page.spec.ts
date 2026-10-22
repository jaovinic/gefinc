import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL, CLIENT_KIND, MemoryTokenStore, SessionService, TokenStore } from '@gefinc/ui-shared';
import { LogoutAction } from '../core/logout';
import { SettingsPage } from './settings.page';

describe('Minha conta (app móvel)', () => {
  const logout = { run: jest.fn() };

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
      ],
    });
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
  }

  beforeEach(() => logout.run.mockReset());
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

    expect(el.querySelector('h2')?.textContent).toContain('Excluir minha conta');
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
});
