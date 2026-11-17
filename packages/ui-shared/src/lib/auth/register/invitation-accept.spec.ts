import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { API, configureAuthTesting, submit, type } from '../testing/auth-testing';
import { InvitationAccept } from './invitation-accept';

describe('InvitationAccept', () => {
  async function setup(token?: string) {
    const ctx = configureAuthTesting();
    const fixture = TestBed.createComponent(InvitationAccept);
    if (token) {
      fixture.componentRef.setInput('token', token);
    }
    fixture.detectChanges();
    await fixture.whenStable();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('sem token na rota mostra erro de convite não encontrado', async () => {
    const { el } = await setup();
    expect(el.textContent).toContain('Convite não encontrado ou link inválido');
  });

  it('token válido carrega a prévia e exibe formulário de aceite', async () => {
    const { el, http, fixture } = await setup('token-valido');
    const req = http.expectOne(`${API}/auth/invitations/token-valido`);
    expect(req.request.method).toBe('GET');
    req.flush({ email: 'convidado@exemplo.com', expiresAt: '2026-11-20T12:00:00Z' });
    fixture.detectChanges();

    const emailInput = el.querySelector('#email') as HTMLInputElement;
    expect(emailInput.value).toBe('convidado@exemplo.com');
    expect(emailInput.disabled).toBe(true);
  });

  it('convite expirado ou já utilizado exibe mensagem amigável', async () => {
    const { el, http, fixture } = await setup('token-expirado');
    const req = http.expectOne(`${API}/auth/invitations/token-expirado`);
    req.flush({ code: 'INVITATION_EXPIRED', message: 'Expirado' }, { status: 410, statusText: 'Gone' });
    fixture.detectChanges();

    expect(el.textContent).toContain('Este convite expirou ou já foi utilizado');
  });

  it('aceite do convite com senha válida cria a conta e faz login', async () => {
    const { el, http, fixture } = await setup('token-ok');
    http
      .expectOne(`${API}/auth/invitations/token-ok`)
      .flush({ email: 'novo@exemplo.com', expiresAt: '2026-11-20T12:00:00Z' });
    fixture.detectChanges();

    type(el, '#password', 'senha-valida-10');
    type(el, '#confirm', 'senha-valida-10');
    type(el, '#name', 'Meu Nome');
    submit(el);

    const acceptReq = http.expectOne(`${API}/auth/invitations/token-ok/accept`);
    expect(acceptReq.request.body).toEqual({ password: 'senha-valida-10', name: 'Meu Nome' });
    acceptReq.flush({ id: 10, email: 'novo@exemplo.com', name: 'Meu Nome', role: 'USER' }, { status: 201, statusText: 'Created' });

    const loginReq = http.expectOne(`${API}/auth/login`);
    expect(loginReq.request.body).toEqual({ email: 'novo@exemplo.com', password: 'senha-valida-10' });
    loginReq.flush({ accessToken: 'fake-token' });

    const router = TestBed.inject(Router);
    jest.spyOn(router, 'navigateByUrl');
  });

  it('sistema sob manutenção exibe aviso amigável no aceite', async () => {
    const { el, http, fixture } = await setup('token-maint');
    http
      .expectOne(`${API}/auth/invitations/token-maint`)
      .flush({ email: 'maint@exemplo.com', expiresAt: '2026-11-20T12:00:00Z' });
    fixture.detectChanges();

    type(el, '#password', 'senha-valida-10');
    type(el, '#confirm', 'senha-valida-10');
    submit(el);

    http.expectOne(`${API}/auth/invitations/token-maint/accept`).flush(
      { code: 'MAINTENANCE', detail: 'Sistema em manutenção programada.' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('Sistema em manutenção programada.');
  });
});
