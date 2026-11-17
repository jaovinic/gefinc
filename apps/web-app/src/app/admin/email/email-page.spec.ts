import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { EmailConfig, EmailDelivery, EmailDeliveryPage } from '@gefinc/core-models';
import { API_BASE_URL, CurrentUser, NoticeService } from '@gefinc/ui-shared';
import { pickOption } from '@gefinc/ui-shared/testing';
import { EmailPage } from './email-page';

const BASE = '/api/v1/admin/email';

const config: EmailConfig = { host: 'smtp.exemplo.com', port: 587, from: 'no-reply@exemplo.com', complete: true, authEnabled: true, starttls: true };

const failedReset: EmailDelivery = {
  id: 11,
  createdAt: '2026-11-14T15:30:00Z',
  kind: 'PASSWORD_RESET',
  recipient: { userId: 7, label: 'bruno@teste.com' },
  status: 'FAILED',
  failureReason: 'TIMEOUT',
};
const sentTest: EmailDelivery = {
  id: 10,
  createdAt: '2026-11-14T14:00:00Z',
  kind: 'TEST',
  recipient: { userId: 1, label: 'adm@teste.com' },
  status: 'SENT',
};
const failedInvitation: EmailDelivery = {
  id: 9,
  createdAt: '2026-11-14T13:00:00Z',
  kind: 'INVITATION',
  recipient: { label: 'convidado@teste.com' },
  status: 'FAILED',
  failureReason: 'OTHER',
};
const failedAnonymous: EmailDelivery = {
  id: 8,
  createdAt: '2026-11-14T12:00:00Z',
  kind: 'DELETION_NOTICE',
  recipient: { label: 'anônimo-1a2b3c4d' },
  status: 'FAILED',
  failureReason: 'NOT_CONFIGURED',
};

function page(content: EmailDelivery[], nextCursor?: string): EmailDeliveryPage {
  return nextCursor ? { content, nextCursor } : { content };
}

describe('EmailPage', () => {
  let http: HttpTestingController;
  const toast = jest.fn();

  async function setup(first: EmailDeliveryPage = page([failedReset, sentTest, failedInvitation, failedAnonymous])) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1' },
        { provide: CurrentUser, useValue: { clear: jest.fn(), load: jest.fn() } },
        { provide: NoticeService, useValue: { toast } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EmailPage);
    fixture.detectChanges();
    http.expectOne((r) => r.method === 'GET' && r.url === `${BASE}/config`).flush(config);
    listRequest().flush(first);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const listRequest = () => http.expectOne((r) => r.method === 'GET' && r.url === `${BASE}/deliveries`);
  const rows = (el: HTMLElement) => Array.from(el.querySelectorAll('[data-testid="delivery-row"]'));
  const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  afterEach(() => {
    http.verify();
    toast.mockClear();
  });

  it('mostra a configuração sem nenhum campo de usuário ou senha', async () => {
    const { el } = await setup();

    expect(text(el.querySelector('[data-testid="config-host"]'))).toBe('smtp.exemplo.com');
    expect(text(el.querySelector('[data-testid="config-port"]'))).toBe('587');
    expect(text(el.querySelector('[data-testid="config-from"]'))).toBe('no-reply@exemplo.com');
    expect(text(el.querySelector('[data-testid="config-complete"]'))).toBe('Sim');
    expect(text(el.querySelector('[data-testid="config-auth"]'))).toBe('Ativada');
    expect(text(el.querySelector('[data-testid="config-starttls"]'))).toBe('Ativado');
    expect(el.querySelector('input')).toBeNull();
    expect(text(el.querySelector('[data-testid="config-card"]')).toLowerCase()).not.toContain('senha');
  });

  it('envia o teste e mostra enviado em texto e ícone, recarregando o histórico', async () => {
    const { fixture, el } = await setup();

    (el.querySelector('[data-testid="send-test"]') as HTMLButtonElement).click();
    const test = http.expectOne((r) => r.method === 'POST' && r.url === `${BASE}/test`);
    fixture.detectChanges();
    expect((el.querySelector('[data-testid="send-test"]') as HTMLButtonElement).disabled).toBe(true);
    test.flush({ status: 'SENT' });
    listRequest().flush(page([sentTest]));
    await settle(fixture);

    expect(text(el.querySelector('[data-testid="test-result"]'))).toContain('Enviado');
    expect(el.querySelector('[data-testid="test-result"] gef-icon')).not.toBeNull();
    expect(text(el.querySelector('[data-testid="test-status"]'))).toBe('E-mail de teste enviado.');
    expect(el.querySelector('[data-testid="test-status"]')?.getAttribute('role')).toBe('status');
  });

  it('mostra a falha do teste com a causa em português', async () => {
    const { fixture, el } = await setup();

    (el.querySelector('[data-testid="send-test"]') as HTMLButtonElement).click();
    http.expectOne((r) => r.method === 'POST' && r.url === `${BASE}/test`).flush({ status: 'FAILED', failureReason: 'AUTHENTICATION' });
    listRequest().flush(page([]));
    await settle(fixture);

    const result = text(el.querySelector('[data-testid="test-result"]'));
    expect(result).toContain('Falhou');
    expect(result).toContain('Usuário ou senha do servidor de e-mail recusados.');
    expect(result).not.toContain('AUTHENTICATION');
  });

  it('mostra o erro de rede do teste', async () => {
    const { fixture, el } = await setup();

    (el.querySelector('[data-testid="send-test"]') as HTMLButtonElement).click();
    http.expectOne((r) => r.method === 'POST' && r.url === `${BASE}/test`).flush({ code: 'TOO_MANY_REQUESTS', status: 429 }, { status: 429, statusText: 'Too Many Requests' });
    await settle(fixture);

    expect(el.querySelector('[data-testid="test-error"]')?.getAttribute('role')).toBe('alert');
    expect(text(el.querySelector('[data-testid="test-error"]'))).toContain('Muitas solicitações');
  });

  it('lista o histórico com tipo, destinatário e situação em texto e ícone', async () => {
    const { el } = await setup();
    const [first, second, third, fourth] = rows(el);

    expect(rows(el)).toHaveLength(4);
    expect(text(first.querySelector('[data-testid="created-at"]'))).toBe('14/11/2026 12:30');
    expect(text(first.querySelector('[data-testid="kind"]'))).toBe('Redefinição de senha');
    expect(first.querySelector('[data-testid="recipient"] a')?.getAttribute('href')).toBe('/admin/users/7');
    expect(text(first.querySelector('[data-testid="status"]'))).toContain('Falhou');
    expect(text(first.querySelector('[data-testid="failure"]'))).toBe('O servidor de e-mail demorou demais para responder.');
    expect(first.querySelector('[data-testid="status"] gef-icon')).not.toBeNull();
    expect(text(second.querySelector('[data-testid="status"]'))).toBe('Enviado');
    expect(third.querySelector('[data-testid="recipient"] a')).toBeNull();
    expect(text(fourth.querySelector('[data-testid="recipient"]'))).toBe('anônimo-1a2b3c4d');
    expect(fourth.querySelector('[data-testid="recipient"] a')).toBeNull();
  });

  it('filtra por situação e tipo', async () => {
    const { fixture } = await setup();

    pickOption(fixture, 'Situação', 'Falhou');
    const byStatus = listRequest();
    expect(byStatus.request.params.get('status')).toBe('FAILED');
    byStatus.flush(page([failedReset]));
    await settle(fixture);

    pickOption(fixture, 'Tipo', 'Redefinição de senha');
    const both = listRequest();
    expect(both.request.params.get('status')).toBe('FAILED');
    expect(both.request.params.get('kind')).toBe('PASSWORD_RESET');
    both.flush(page([failedReset]));
    await settle(fixture);
  });

  it('carrega mais usando o cursor e acrescenta as linhas', async () => {
    const { fixture, el } = await setup(page([failedReset], 'cur1'));

    (el.querySelector('[data-testid="load-more"]') as HTMLButtonElement).click();
    const more = listRequest();
    expect(more.request.params.get('cursor')).toBe('cur1');
    more.flush(page([sentTest]));
    await settle(fixture);

    expect(rows(el)).toHaveLength(2);
    expect(el.querySelector('[data-testid="load-more"]')).toBeNull();
  });

  it('mostra o estado vazio quando não há envios', async () => {
    const { el } = await setup(page([]));
    expect(el.querySelector('gef-empty')).not.toBeNull();
  });

  it('mostra o erro com nova tentativa quando o histórico não carrega', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1' },
        { provide: CurrentUser, useValue: { clear: jest.fn(), load: jest.fn() } },
        { provide: NoticeService, useValue: { toast } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EmailPage);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${BASE}/config`).flush(config);
    listRequest().flush({ code: 'INTERNAL', status: 500 }, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('gef-error')).not.toBeNull();
  });

  it('oferece Reenviar só para redefinição de senha com falha e conta existente', async () => {
    const { el } = await setup();
    const [first, second, third, fourth] = rows(el);

    expect(first.querySelector('[data-testid="resend"]')).not.toBeNull();
    expect(second.querySelector('[data-testid="resend"]')).toBeNull();
    expect(third.querySelector('[data-testid="resend"]')).toBeNull();
    expect(fourth.querySelector('[data-testid="resend"]')).toBeNull();
  });

  it('reenvia, avisa e recarrega o histórico', async () => {
    const { fixture, el } = await setup();

    (el.querySelector('[data-testid="resend"]') as HTMLButtonElement).click();
    http.expectOne((r) => r.method === 'POST' && r.url === `${BASE}/deliveries/11/resend`).flush(null, { status: 202, statusText: 'Accepted' });
    listRequest().flush(page([sentTest]));
    await settle(fixture);

    expect(toast).toHaveBeenCalled();
    expect(text(el.querySelector('[data-testid="action-message"]'))).toContain('reenviada');
    expect(el.querySelector('[data-testid="action-message"]')?.getAttribute('role')).toBe('status');
  });

  it.each([
    [409, 'ACCOUNT_NOT_USABLE', 'não pode receber'],
    [429, 'TOO_MANY_REQUESTS', 'Muitas solicitações'],
  ])('mostra a recusa %s do reenvio', async (status, code, fragment) => {
    const { fixture, el } = await setup();

    (el.querySelector('[data-testid="resend"]') as HTMLButtonElement).click();
    http.expectOne((r) => r.method === 'POST' && r.url === `${BASE}/deliveries/11/resend`).flush({ code, status }, { status, statusText: 'x' });
    await settle(fixture);

    expect(text(el.querySelector('[data-testid="action-message"]'))).toContain(fragment);
  });
});
