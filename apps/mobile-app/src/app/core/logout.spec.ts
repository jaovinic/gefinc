import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { SessionService } from '@gefinc/ui-shared';
import { PendingQueue } from '../offline/pending-queue';
import { LocalDataWipe } from '../offline/local-data-wipe';
import { LogoutAction } from './logout';

describe('LogoutAction (sair com operações pendentes)', () => {
  const pendingCount = signal(0);
  const discardAll = jest.fn(async () => undefined);
  const logoutRequest = jest.fn(() => of(undefined));
  const navigate = jest.fn();

  beforeEach(() => {
    pendingCount.set(0);
    discardAll.mockClear();
    logoutRequest.mockClear();
    navigate.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PendingQueue, useValue: { pendingCount, discardAll } },
        { provide: SessionService, useValue: { logout: logoutRequest } },
        { provide: Router, useValue: { navigate } },
        { provide: LocalDataWipe, useValue: {} },
      ],
    });
  });

  it('sem operações pendentes sai direto e volta ao login', () => {
    const logout = TestBed.inject(LogoutAction);

    logout.run();

    expect(logout.confirming()).toBe(false);
    expect(logoutRequest).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('com operações não enviadas pede confirmação antes de sair', () => {
    pendingCount.set(2);
    const logout = TestBed.inject(LogoutAction);

    logout.run();

    expect(logout.confirming()).toBe(true);
    expect(logout.pending()).toBe(2);
    expect(logoutRequest).not.toHaveBeenCalled();
  });

  it('cancelar a confirmação mantém a sessão e a fila', () => {
    pendingCount.set(1);
    const logout = TestBed.inject(LogoutAction);
    logout.run();

    logout.cancel();

    expect(logout.confirming()).toBe(false);
    expect(logoutRequest).not.toHaveBeenCalled();
    expect(discardAll).not.toHaveBeenCalled();
  });

  it('confirmar descarta as operações e então sai', async () => {
    pendingCount.set(1);
    const logout = TestBed.inject(LogoutAction);
    logout.run();

    await logout.confirmDiscard();

    expect(discardAll).toHaveBeenCalledTimes(1);
    expect(logoutRequest).toHaveBeenCalledTimes(1);
    expect(logout.confirming()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
