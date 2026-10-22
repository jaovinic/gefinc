import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API, configureAuthTesting, submit, type } from '../testing/auth-testing';
import { ForgotPassword } from './forgot-password';

describe('ForgotPassword', () => {
  async function setup() {
    const ctx = configureAuthTesting();
    const fixture = TestBed.createComponent(ForgotPassword);
    fixture.detectChanges();
    await fixture.whenStable();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('mostra sempre a mesma mensagem neutra após solicitar o link', async () => {
    const { el, http, fixture } = await setup();
    type(el, '#email', 'ninguem@example.com');
    submit(el);
    http.expectOne(`${API}/auth/password-reset/request`).flush(null, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();

    expect(el.querySelector('[role="status"]')?.textContent).toContain('Se o e-mail estiver cadastrado');
  });

  it('avisa quando há solicitações demais', async () => {
    const { el, http, fixture } = await setup();
    type(el, '#email', 'ana@example.com');
    submit(el);
    http.expectOne(`${API}/auth/password-reset/request`).flush({ code: 'TOO_MANY_REQUESTS' }, { status: 429, statusText: 'Too Many Requests' });
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Muitas solicitações');
  });
});
