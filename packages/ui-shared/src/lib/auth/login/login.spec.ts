import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API, configureAuthTesting, submit, type } from '../testing/auth-testing';
import { Login } from './login';

describe('Login', () => {
  async function setup(statusResponse?: { maintenance: boolean; message?: string; signupsOpen: boolean }) {
    const ctx = configureAuthTesting();
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    await fixture.whenStable();

    const statusReqs = ctx.http.match(`${API}/system/status`);
    if (statusReqs.length > 0) {
      statusReqs[0].flush(statusResponse ?? { maintenance: false, signupsOpen: true });
      fixture.detectChanges();
    }

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

  it('conta suspensa com a senha certa mostra a orientação de procurar o suporte, sem o motivo', async () => {
    const { el, http, fixture } = await setup();
    await fill(el);
    submit(el);
    http
      .expectOne(`${API}/auth/login`)
      .flush(
        { code: 'ACCOUNT_SUSPENDED', detail: 'Sua conta está suspensa.', supportHint: 'Fale com o suporte.' },
        { status: 403, statusText: 'Forbidden' },
      );
    fixture.detectChanges();

    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Conta suspensa. Procure o suporte.');
    expect(el.textContent).not.toContain('agendada');
    expect(el.querySelector('button.gef-btn-secondary[disabled]')).toBeNull();
  });

  it('tem o link do aviso de privacidade no rodapé', async () => {
    const { el } = await setup();

    const link = el.querySelector('[data-testid="privacy-link"]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/privacidade');
    expect(link.textContent).toContain('Privacidade');
  });

  it('mostra faixa de manutenção quando GET /system/status retorna maintenance: true', async () => {
    const { el } = await setup({
      maintenance: true,
      message: 'Sistema em manutenção para atualização programada.',
      signupsOpen: false,
    });

    const banner = el.querySelector('[data-testid="maintenance-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Sistema em manutenção');
    expect(banner?.textContent).toContain('atualização programada');
  });

  it('login retornando 503 com MAINTENANCE mostra a mensagem da manutenção no alerta de erro', async () => {
    const { el, http, fixture } = await setup();
    await fill(el);
    submit(el);

    http
      .expectOne(`${API}/auth/login`)
      .flush(
        { code: 'MAINTENANCE', message: 'Serviço indisponível temporariamente. Volte em 15 minutos.' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    fixture.detectChanges();

    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Serviço indisponível temporariamente. Volte em 15 minutos.');
  });
});
