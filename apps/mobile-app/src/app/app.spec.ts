import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { LogoutAction } from './core/logout';
import { AppLockService } from './lock/app-lock.service';

describe('App', () => {
  const locked = signal(false);
  const lock = { locked, message: signal<string | null>(null), passwordRequired: signal(false), unlock: jest.fn(async () => undefined) };

  function render() {
    locked.set(false);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AppLockService, useValue: lock }, { provide: LogoutAction, useValue: { run: jest.fn() } }],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('usa o router-outlet comum: a tela anterior é destruída ao navegar (sem ids duplicados no DOM)', () => {
    const { el } = render();

    expect(el.querySelector('ion-app')).not.toBeNull();
    expect(el.querySelector('router-outlet')).not.toBeNull();
    expect(el.querySelector('ion-router-outlet')).toBeNull();
  });

  it('bloqueado: o app inteiro fica inerte (sem foco nem leitura) por baixo da tela de bloqueio', () => {
    const { fixture, el } = render();
    expect(el.querySelector('ion-app')?.hasAttribute('inert')).toBe(false);
    expect(el.querySelector('[data-testid="lock-screen"]')).toBeNull();

    locked.set(true);
    fixture.detectChanges();

    expect(el.querySelector('ion-app')?.hasAttribute('inert')).toBe(true);
    expect(el.querySelector('ion-app')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('[data-testid="lock-screen"]')).not.toBeNull();
  });
});
