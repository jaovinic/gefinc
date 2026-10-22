import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../api';
import { API, configureAuthTesting, submit, type } from '../testing/auth-testing';
import { DeleteAccount } from './delete-account';

describe('DeleteAccount', () => {
  async function setup() {
    const ctx = configureAuthTesting();
    const fixture = TestBed.createComponent(DeleteAccount);
    fixture.detectChanges();
    await fixture.whenStable();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('dentro de outra tela (embutida) usa subtítulo em vez de título da página', async () => {
    const ctx = configureAuthTesting();
    const fixture = TestBed.createComponent(DeleteAccount);
    fixture.componentRef.setInput('embedded', true);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')).toBeNull();
    expect(el.querySelector('h2')?.textContent).toContain('Excluir minha conta');
    ctx.http.verify();
  });

  it('agenda a exclusão, mostra a data limite e encerra a sessão local', async () => {
    const { el, http, fixture } = await setup();
    const session = TestBed.inject(SessionService);
    session.authenticated.set(true);
    type(el, '#password', 'senha-forte-123');
    submit(el);

    http.expectOne(`${API}/auth/account-deletion`).flush({ deletionDate: '2026-12-10' }, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();

    expect(el.querySelector('[role="status"]')?.textContent).toContain('10/12/2026');
    expect(session.authenticated()).toBe(false);
  });

  it('senha incorreta mostra o erro e não encerra a sessão', async () => {
    const { el, http, fixture } = await setup();
    const session = TestBed.inject(SessionService);
    session.authenticated.set(true);
    type(el, '#password', 'errada');
    submit(el);
    http.expectOne(`${API}/auth/account-deletion`).flush({ code: 'INVALID_CREDENTIALS' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('E-mail ou senha incorretos.');
    expect(session.authenticated()).toBe(true);
  });
});
