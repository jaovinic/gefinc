import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL, NoticeService } from '@gefinc/ui-shared';
import type { AdminInvitationView } from '../admin.api';
import { InvitationsPage } from './invitations-page';

const LIST_URL = '/api/v1/admin/invitations';

const mockInvitations: AdminInvitationView[] = [
  {
    id: 1,
    status: 'PENDING',
    email: 'convidado@teste.com',
    invitedBy: { id: 2, label: 'Admin Carlos' },
    createdAt: '2026-11-14T10:00:00Z',
    expiresAt: '2026-11-21T10:00:00Z',
  },
  {
    id: 2,
    status: 'ACCEPTED',
    email: null,
    invitedBy: { id: 2, label: 'Admin Carlos' },
    createdAt: '2026-11-10T10:00:00Z',
    expiresAt: '2026-11-17T10:00:00Z',
    resolvedAt: '2026-11-11T12:00:00Z',
    acceptedUserId: 99,
  },
  {
    id: 3,
    status: 'CANCELED',
    email: null,
    invitedBy: { id: 2, label: 'Admin Carlos' },
    createdAt: '2026-11-01T10:00:00Z',
    expiresAt: '2026-11-08T10:00:00Z',
    resolvedAt: '2026-11-02T15:00:00Z',
  },
];

describe('InvitationsPage', () => {
  let http: HttpTestingController;
  let toast: jest.Mock;

  beforeEach(() => {
    toast = jest.fn();
    TestBed.configureTestingModule({
      imports: [InvitationsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1' },
        { provide: NoticeService, useValue: { toast } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  function setup() {
    const fixture = TestBed.createComponent(InvitationsPage);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('carrega a lista inicial de convites e exibe na tabela', () => {
    const { fixture, el } = setup();

    const req = http.expectOne(LIST_URL);
    expect(req.request.method).toBe('GET');
    req.flush(mockInvitations);
    fixture.detectChanges();

    const rows = el.querySelectorAll('[data-testid="invitation-row"]');
    expect(rows.length).toBe(3);

    // Linha 1 (PENDING)
    const emailCell = rows[0].querySelector('[data-testid="inv-email"]');
    expect(emailCell?.textContent).toContain('convidado@teste.com');
    const statusCell = rows[0].querySelector('[data-testid="inv-status"]');
    expect(statusCell?.textContent).toContain('Pendente');
    expect(rows[0].querySelector('[data-testid="resend-btn"]')).not.toBeNull();
    expect(rows[0].querySelector('[data-testid="cancel-btn"]')).not.toBeNull();

    // Linha 2 (ACCEPTED - email anonimizado/nulo)
    expect(rows[1].querySelector('[data-testid="inv-email"]')?.textContent).toContain('—');
    expect(rows[1].querySelector('[data-testid="inv-status"]')?.textContent).toContain('Aceito');
    expect(rows[1].querySelector('[data-testid="resend-btn"]')).toBeNull();
  });

  it('filtra convites por situação ao selecionar', () => {
    const { fixture, el } = setup();

    http.expectOne(LIST_URL).flush(mockInvitations);
    fixture.detectChanges();

    // Altera o filtro
    fixture.componentInstance.onStatusChange('PENDING');
    fixture.detectChanges();

    const req = http.expectOne(`${LIST_URL}?status=PENDING`);
    expect(req.request.method).toBe('GET');
    req.flush([mockInvitations[0]]);
    fixture.detectChanges();

    const rows = el.querySelectorAll('[data-testid="invitation-row"]');
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector('[data-testid="inv-email"]')?.textContent).toContain('convidado@teste.com');
  });

  it('abre o modal, valida envio e cria convite com sucesso', () => {
    const { fixture, el } = setup();

    http.expectOne(LIST_URL).flush(mockInvitations);
    fixture.detectChanges();

    // Abre o modal
    const openBtn = el.querySelector('[data-testid="invite-open-btn"]') as HTMLButtonElement;
    openBtn.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="invite-modal"]')).not.toBeNull();

    // Digita e-mail
    const emailInput = el.querySelector('[data-testid="invite-email-input"]') as HTMLInputElement;
    emailInput.value = 'novo.convidado@teste.com';
    emailInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // Submete
    const submitBtn = el.querySelector('[data-testid="invite-submit-btn"]') as HTMLButtonElement;
    submitBtn.click();
    fixture.detectChanges();

    const createReq = http.expectOne(LIST_URL);
    expect(createReq.request.method).toBe('POST');
    expect(createReq.request.body).toEqual({ email: 'novo.convidado@teste.com' });
    createReq.flush(mockInvitations[0], { status: 201, statusText: 'Created' });

    // Recarregamento da lista
    const reloadReq = http.expectOne(LIST_URL);
    reloadReq.flush(mockInvitations);
    fixture.detectChanges();

    expect(toast).toHaveBeenCalledWith('Convite enviado com sucesso.');
    expect(el.querySelector('[data-testid="invite-modal"]')).toBeNull();
  });

  it('o modal é um painel opaco acessível (gef-sheet): diálogo modal, fecha com o toque no fundo e com Escape', () => {
    const { fixture, el } = setup();

    http.expectOne(LIST_URL).flush(mockInvitations);
    fixture.detectChanges();

    (el.querySelector('[data-testid="invite-open-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const dialog = el.querySelector('.gef-sheet[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Convidar usuário');
    expect(dialog.contains(el.querySelector('[data-testid="invite-modal"]'))).toBe(true);

    (el.querySelector('.gef-sheet-backdrop') as HTMLElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="invite-modal"]')).toBeNull();

    (el.querySelector('[data-testid="invite-open-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    el.querySelector('.gef-sheet-backdrop')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="invite-modal"]')).toBeNull();
  });

  it('os selos de situação usam só tokens do tema, sem cores cruas', () => {
    const { fixture } = setup();
    http.expectOne(LIST_URL).flush(mockInvitations);
    const page = fixture.componentInstance as unknown as { statusBadge(status: string): { tone: string } };
    for (const status of ['PENDING', 'ACCEPTED', 'CANCELED', 'EXPIRED', 'OTHER']) {
      expect(page.statusBadge(status).tone).not.toMatch(/amber|emerald|rose|red-\d/);
      expect(page.statusBadge(status).tone).toContain('gefinc');
    }
  });

  it('exibe erro de e-mail já cadastrado no modal sem fechar', () => {
    const { fixture, el } = setup();

    http.expectOne(LIST_URL).flush(mockInvitations);
    fixture.detectChanges();

    (el.querySelector('[data-testid="invite-open-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const emailInput = el.querySelector('[data-testid="invite-email-input"]') as HTMLInputElement;
    emailInput.value = 'existente@teste.com';
    emailInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (el.querySelector('[data-testid="invite-submit-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const createReq = http.expectOne(LIST_URL);
    createReq.flush(
      { code: 'EMAIL_ALREADY_REGISTERED', detail: 'Este e-mail já está cadastrado.' },
      { status: 409, statusText: 'Conflict' }
    );
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="invite-modal"]')).not.toBeNull();
    const errorEl = el.querySelector('[data-testid="invite-error"]');
    expect(errorEl?.textContent).toContain('Este e-mail já está cadastrado.');
  });

  it('permite reenviar convite pendente', () => {
    const { fixture, el } = setup();

    http.expectOne(LIST_URL).flush(mockInvitations);
    fixture.detectChanges();

    const resendBtn = el.querySelector('[data-testid="resend-btn"]') as HTMLButtonElement;
    resendBtn.click();
    fixture.detectChanges();

    const resendReq = http.expectOne(`${LIST_URL}/1/resend`);
    expect(resendReq.request.method).toBe('POST');
    resendReq.flush(mockInvitations[0]);

    // Recarrega
    http.expectOne(LIST_URL).flush(mockInvitations);
    fixture.detectChanges();

    expect(toast).toHaveBeenCalledWith('Convite reenviado com sucesso.');
  });

  const dialog = () => document.querySelector('[role="alertdialog"]') as HTMLElement | null;
  const press = (testId: string) => (document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();

  function openCancel() {
    const ctx = setup();
    http.expectOne(LIST_URL).flush(mockInvitations);
    ctx.fixture.detectChanges();
    (ctx.el.querySelector('[data-testid="cancel-btn"]') as HTMLButtonElement).click();
    ctx.fixture.detectChanges();
    return ctx;
  }

  it('"Cancelar" na linha só abre a confirmação (alertdialog) citando o e-mail; nada é cancelado ainda', () => {
    openCancel();

    http.expectNone(`${LIST_URL}/1`);
    const box = dialog();
    expect(box).not.toBeNull();
    expect(box?.getAttribute('aria-label')).toBe('Cancelar convite');
    expect(box?.textContent).toContain('convidado@teste.com');
    expect(box?.textContent).toContain('deixa de funcionar');
    expect(box?.querySelector('[data-testid="confirm-cancel"]')?.textContent?.trim()).toBe('Voltar');
    expect(box?.querySelector('[data-testid="confirm-confirm"]')?.textContent?.trim()).toBe('Cancelar convite');
  });

  it('confirmar cancela o convite (DELETE), recarrega a lista e exibe o toast', () => {
    const { fixture } = openCancel();

    press('confirm-confirm');
    fixture.detectChanges();

    const cancelReq = http.expectOne(`${LIST_URL}/1`);
    expect(cancelReq.request.method).toBe('DELETE');
    cancelReq.flush(null, { status: 204, statusText: 'No Content' });

    // Recarrega
    http.expectOne(LIST_URL).flush(mockInvitations);
    fixture.detectChanges();

    expect(toast).toHaveBeenCalledWith('Convite cancelado com sucesso.');
    expect(dialog()).toBeNull();
  });

  it('"Voltar" fecha a confirmação sem chamar a API', () => {
    const { fixture } = openCancel();

    press('confirm-cancel');
    fixture.detectChanges();

    http.expectNone(`${LIST_URL}/1`);
    expect(dialog()).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it('falha ao cancelar mantém o diálogo aberto com o erro dentro dele (sem toast)', () => {
    const { fixture } = openCancel();

    press('confirm-confirm');
    fixture.detectChanges();
    http.expectOne(`${LIST_URL}/1`).flush({ code: 'INTERNAL_ERROR' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(dialog()).not.toBeNull();
    expect(dialog()?.querySelector('[data-testid="confirm-error"]')?.textContent?.trim()).not.toBe('');
    expect(toast).not.toHaveBeenCalled();
  });

  it('convite sem e-mail usa o texto "este convite" na confirmação', () => {
    const { fixture, el } = setup();
    http.expectOne(LIST_URL).flush([{ ...mockInvitations[0], email: null }]);
    fixture.detectChanges();

    (el.querySelector('[data-testid="cancel-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(dialog()?.textContent).toContain('este convite');
  });

  it('reenviar continua sem confirmação', () => {
    const { fixture, el } = setup();
    http.expectOne(LIST_URL).flush(mockInvitations);
    fixture.detectChanges();

    (el.querySelector('[data-testid="resend-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(dialog()).toBeNull();
    http.expectOne(`${LIST_URL}/1/resend`).flush(mockInvitations[0]);
    http.expectOne(LIST_URL).flush(mockInvitations);
  });
});
