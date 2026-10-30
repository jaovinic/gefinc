import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API, configureAuthTesting, submit, type } from '../testing/auth-testing';
import { Login } from './login';

describe('Login', () => {
  async function setup() {
    const ctx = configureAuthTesting();
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    await fixture.whenStable();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function fill(el: HTMLElement) {
    type(el, '#email', 'ana@example.com');
    type(el, '#password', 'senha-forte-123');
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('mostra o logo do GEFINC no cartão de acesso', async () => {
    const { el } = await setup();
    expect(el.querySelector('gef-auth-card gef-logo svg[aria-label="GEFINC"]')).not.toBeNull();
    expect(el.querySelector('gef-logo')?.textContent).toContain('GEFINC');
  });

  it('não chama a API com o formulário inválido', async () => {
    const { el, http, fixture } = await setup();
    submit(el);
    fixture.detectChanges();
    http.expectNone(`${API}/auth/login`);
    expect(el.textContent).toContain('Informe um e-mail válido.');
  });

  it('entra e navega para a página inicial', async () => {
    const { el, http, navigateByUrl, fixture } = await setup();
    await fill(el);
    submit(el);

    const req = http.expectOne(`${API}/auth/login`);
    expect(req.request.body).toEqual({ email: 'ana@example.com', password: 'senha-forte-123' });
    req.flush({ accessToken: 'abc', expiresIn: 900 });
    await fixture.whenStable();

    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('mostra mensagem genérica para credenciais erradas', async () => {
    const { el, http, fixture } = await setup();
    await fill(el);
    submit(el);
    http.expectOne(`${API}/auth/login`).flush({ code: 'INVALID_CREDENTIALS' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('E-mail ou senha incorretos.');
  });

  it('avisa para aguardar quando o servidor bloqueia por excesso de tentativas', async () => {
    const { el, http, fixture } = await setup();
    await fill(el);
    submit(el);
    http.expectOne(`${API}/auth/login`).flush({ code: 'TOO_MANY_REQUESTS' }, { status: 429, statusText: 'Too Many Requests' });
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Aguarde alguns minutos');
  });

  it('com exclusão pendente oferece cancelar e depois entra', async () => {
    const { el, http, navigateByUrl, fixture } = await setup();
    await fill(el);
    submit(el);
    http
      .expectOne(`${API}/auth/login`)
      .flush({ code: 'ACCOUNT_DELETION_PENDING', deletionDate: '2026-12-10' }, { status: 423, statusText: 'Locked' });
    fixture.detectChanges();

    expect(el.textContent).toContain('agendada para 10/12/2026');
    const cancel = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Cancelar a exclusão')) as HTMLButtonElement;
    cancel.click();

    http.expectOne(`${API}/auth/account-deletion/cancel`).flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne(`${API}/auth/login`).flush({ accessToken: 'abc', expiresIn: 900 });
    await fixture.whenStable();
    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });
});
