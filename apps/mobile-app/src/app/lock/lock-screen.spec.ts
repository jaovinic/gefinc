import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LogoutAction } from '../core/logout';
import { AppLockService } from './app-lock.service';
import { LockScreen } from './lock-screen';

describe('LockScreen', () => {
  const locked = signal(false);
  const lock = {
    locked,
    message: signal<string | null>(null),
    passwordRequired: signal(false),
    unlock: jest.fn(async () => undefined),
  };
  const logout = { run: jest.fn() };

  function render() {
    const fixture = TestBed.createComponent(LockScreen);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    locked.set(false);
    lock.message.set(null);
    lock.passwordRequired.set(false);
    lock.unlock.mockClear();
    logout.run.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AppLockService, useValue: lock },
        { provide: LogoutAction, useValue: logout },
      ],
    });
  });

  it('desbloqueado: não mostra nada', () => {
    const { el } = render();

    expect(el.querySelector('[data-testid="lock-screen"]')).toBeNull();
  });

  it('bloqueado: cobre o app, não mostra conteúdo financeiro e tenta a biometria sozinho', async () => {
    locked.set(true);
    const { fixture, el } = render();
    await fixture.whenStable();
    fixture.detectChanges();

    const screen = el.querySelector('[data-testid="lock-screen"]') as HTMLElement;
    expect(screen.getAttribute('role')).toBe('dialog');
    expect(screen.getAttribute('aria-modal')).toBe('true');
    expect(screen.textContent).toContain('GEFINC');
    expect(screen.textContent).not.toMatch(/R\$/);
    expect(lock.unlock).toHaveBeenCalledTimes(1);
  });

  it('mostra o aviso do bloqueio e oferece Desbloquear e Entrar com senha', () => {
    locked.set(true);
    lock.message.set('Biometria não reconhecida. Tente de novo.');
    const { el } = render();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Biometria não reconhecida');
    const buttons = Array.from(el.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(buttons).toEqual(['Desbloquear com biometria', 'Entrar com e-mail e senha']);
  });

  it('Desbloquear tenta de novo e Entrar com senha encerra a sessão (com confirmação se houver pendências)', () => {
    locked.set(true);
    const { el } = render();
    lock.unlock.mockClear();

    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Desbloquear')) as HTMLButtonElement).click();
    expect(lock.unlock).toHaveBeenCalledTimes(1);

    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('e-mail e senha')) as HTMLButtonElement).click();
    expect(logout.run).toHaveBeenCalledTimes(1);
  });

  it('quando a senha é obrigatória (biometria indisponível ou bloqueada), só oferece a senha', () => {
    locked.set(true);
    lock.passwordRequired.set(true);
    const { el } = render();

    expect(Array.from(el.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['Entrar com e-mail e senha']);
  });
});
