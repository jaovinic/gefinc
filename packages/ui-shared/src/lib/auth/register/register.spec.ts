import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API, configureAuthTesting, submit, type } from '../testing/auth-testing';
import { Register } from './register';

describe('Register', () => {
  async function setup() {
    const ctx = configureAuthTesting();
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    await fixture.whenStable();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('valida a política de senha e a confirmação antes de chamar a API', async () => {
    const { el, http, fixture } = await setup();
    type(el, '#email', 'ana@example.com');
    type(el, '#password', 'curta');
    type(el, '#confirm', 'outra');
    submit(el);
    fixture.detectChanges();

    http.expectNone(`${API}/auth/register`);
    expect(el.textContent).toContain('pelo menos 10 caracteres');
    expect(el.textContent).toContain('As senhas não conferem.');
  });

  it('cadastra, entra automaticamente e vai para a página inicial', async () => {
    const { el, http, navigateByUrl, fixture } = await setup();
    type(el, '#email', 'ana@example.com');
    type(el, '#password', 'senha-forte-123');
    type(el, '#confirm', 'senha-forte-123');
    submit(el);

    http.expectOne(`${API}/auth/register`).flush({ id: 1, email: 'ana@example.com', createdAt: '2026-11-10T15:00:00Z' }, { status: 201, statusText: 'Created' });
    http.expectOne(`${API}/auth/login`).flush({ accessToken: 'abc', expiresIn: 900 });
    await fixture.whenStable();

    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('mostra o erro de e-mail já cadastrado vindo do servidor', async () => {
    const { el, http, fixture } = await setup();
    type(el, '#email', 'ana@example.com');
    type(el, '#password', 'senha-forte-123');
    type(el, '#confirm', 'senha-forte-123');
    submit(el);
    http.expectOne(`${API}/auth/register`).flush({ code: 'EMAIL_ALREADY_REGISTERED' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Este e-mail já está cadastrado.');
  });
});
