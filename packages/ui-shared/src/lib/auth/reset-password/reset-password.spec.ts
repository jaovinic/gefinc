import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API, configureAuthTesting, submit, type } from '../testing/auth-testing';
import { ResetPassword } from './reset-password';

describe('ResetPassword', () => {
  async function setup(token?: string) {
    const ctx = configureAuthTesting();
    const fixture = TestBed.createComponent(ResetPassword);
    if (token) {
      fixture.componentRef.setInput('token', token);
    }
    fixture.detectChanges();
    await fixture.whenStable();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('sem token no link pede um novo', async () => {
    const { el } = await setup();
    expect(el.textContent).toContain('Link inválido');
  });

  it('altera a senha com o token do link', async () => {
    const { el, http, fixture } = await setup('abc123');
    type(el, '#password', 'nova-senha-segura-456');
    type(el, '#confirm', 'nova-senha-segura-456');
    submit(el);

    const req = http.expectOne(`${API}/auth/password-reset/confirm`);
    expect(req.request.body).toEqual({ token: 'abc123', newPassword: 'nova-senha-segura-456' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(el.querySelector('[role="status"]')?.textContent).toContain('Senha alterada');
  });

  it('link expirado mostra o motivo e oferece solicitar outro', async () => {
    const { el, http, fixture } = await setup('velho');
    type(el, '#password', 'nova-senha-segura-456');
    type(el, '#confirm', 'nova-senha-segura-456');
    submit(el);
    http.expectOne(`${API}/auth/password-reset/confirm`).flush({ code: 'INVALID_RESET_TOKEN' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(el.textContent).toContain('inválido, já foi usado ou expirou');
    expect(el.textContent).toContain('Solicitar novo link');
  });
});
