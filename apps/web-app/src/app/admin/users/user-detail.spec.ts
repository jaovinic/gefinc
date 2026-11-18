import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { AdminSession, AdminUserDetail } from '@gefinc/core-models';
import { API_BASE_URL, CurrentUser, NoticeService } from '@gefinc/ui-shared';
import { UserDetail } from './user-detail';

const URL = '/api/v1/admin/users/7';
const SESSIONS_URL = `${URL}/sessions`;

const base: AdminUserDetail = {
  id: 7,
  email: 'ana@teste.com',
  name: 'Ana Souza',
  createdAt: '2026-11-14T02:30:00Z',
  lastAccessAt: '2026-11-14T19:05:00Z',
  role: 'USER',
  suspended: false,
  deletionPending: false,
  openSessions: 3,
  protected: false,
  recentActions: [],
};

describe('UserDetail', () => {
  let http: HttpTestingController;
  let toast: jest.Mock;

  async function setup(first: AdminUserDetail | 'pending' = base, sessions: AdminSession[] = [], selfId = 1) {
    TestBed.resetTestingModule();
    toast = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'admin/users/:id', component: UserDetail }, { path: 'admin/users', component: UserDetail }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1' },
        { provide: CurrentUser, useValue: { clear: jest.fn(), load: jest.fn(), profile: signal({ id: selfId, email: 'adm@teste.com' }) } },
        { provide: NoticeService, useValue: { toast } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/users/7');
    harness.fixture.detectChanges();
    if (first !== 'pending') {
      detailRequest().flush(first);
      await settle(harness);
      sessionsRequest().flush(sessions);
      await settle(harness);
    }
    return { harness, el: harness.routeNativeElement as HTMLElement };
  }

  async function settle(harness: { fixture: { detectChanges(): void; whenStable(): Promise<unknown> } }) {
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }

  const detailRequest = () => http.expectOne((r) => r.method === 'GET' && r.url === URL);
  const sessionsRequest = () => http.expectOne((r) => r.method === 'GET' && r.url === SESSIONS_URL);
  const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const field = (el: HTMLElement, id: string) => text(el.querySelector(`[data-testid="${id}"]`));
  const action = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;
  const actionLabels = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('[data-testid="actions"] button')).map((b) => text(b));

  afterEach(() => http.verify());

  it('pede o usuário da rota (uma abertura) e mostra o carregamento', async () => {
    const { el } = await setup('pending');

    expect(el.querySelector('gef-loading')).not.toBeNull();
    detailRequest();
  });

  it('mostra os dados da conta com datas no horário de Brasília', async () => {
    const { el } = await setup();

    expect(field(el, 'email')).toBe('ana@teste.com');
    expect(field(el, 'name')).toBe('Ana Souza');
    expect(field(el, 'created-at')).toBe('13/11/2026 23:30');
    expect(field(el, 'last-access')).toBe('14/11/2026 16:05');
    expect(field(el, 'role')).toBe('Usuário');
    expect(field(el, 'status')).toBe('Ativo');
    expect(el.querySelector('h2')?.textContent).toContain('Ana Souza');
  });

  it('sem nome nem acesso mostra os textos de ausência', async () => {
    const { el } = await setup({ ...base, name: undefined, lastAccessAt: undefined });

    expect(field(el, 'name')).toBe('Sem nome');
    expect(field(el, 'last-access')).toBe('Nunca acessou');
  });

  it('mostra a contagem de sessões abertas', async () => {
    const { el } = await setup();

    expect(field(el, 'open-sessions')).toBe('3');
    const zero = await setup({ ...base, openSessions: 0 });
    expect(field(zero.el, 'open-sessions')).toBe('0');
  });

  it('mostra o bloqueio de login até quando, ou que não há', async () => {
    const free = await setup();
    expect(field(free.el, 'login-lock')).toBe('Sem bloqueio');

    const locked = await setup({ ...base, loginLock: { lockedUntil: '2026-11-14T19:20:00Z' } });
    expect(field(locked.el, 'login-lock')).toBe('Bloqueado até 14/11/2026 16:20');
    expect(locked.el.querySelector('[data-testid="login-lock"] gef-icon')).not.toBeNull();
  });

  it('mostra a exclusão pendente sem justificativa', async () => {
    const none = await setup();
    expect(field(none.el, 'deletion')).toBe('Sem exclusão pendente');

    const { el } = await setup({
      ...base,
      deletionPending: true,
      deletion: { origin: 'USER', requestedAt: '2026-11-10T15:00:00Z', dueAt: '2026-12-10T15:00:00Z' },
    });
    const deletion = field(el, 'deletion');
    expect(deletion).toContain('pedida pelo próprio usuário');
    expect(deletion).toContain('10/11/2026 12:00');
    expect(deletion).toContain('10/12/2026 12:00');
    expect(deletion.toLowerCase()).not.toContain('justificativa');
    expect(field(el, 'status')).toBe('Aguardando exclusão');
  });

  it('exclusão pedida por administrador é identificada', async () => {
    const { el } = await setup({
      ...base,
      deletionPending: true,
      deletion: { origin: 'ADMIN', requestedAt: '2026-11-10T15:00:00Z', dueAt: '2026-12-10T15:00:00Z' },
    });

    expect(field(el, 'deletion')).toContain('pedida por um administrador');
  });

  it('suspensão aparece na situação, em texto', async () => {
    const { el } = await setup({ ...base, suspended: true });

    expect(field(el, 'status')).toBe('Suspenso');
  });

  it('o administrador raiz é identificado como protegido', async () => {
    const root = await setup({ ...base, role: 'ROOT', protected: true });
    expect(text(root.el.querySelector('[data-testid="protected"]'))).toBe('Administrador raiz protegido');
    expect(field(root.el, 'role')).toBe('Administrador raiz');

    const common = await setup();
    expect(common.el.querySelector('[data-testid="protected"]')).toBeNull();
  });

  it('lista as últimas ações com resumo, quem agiu, quando e a justificativa', async () => {
    const { el } = await setup({
      ...base,
      recentActions: [
        {
          id: 2,
          occurredAt: '2026-11-14T19:00:00Z',
          action: 'USER_SUSPENDED',
          result: 'SUCCESS',
          actor: { userId: 1, label: 'Ana Admin' },
          target: { userId: 7, label: 'ana@teste.com' },
          reason: 'Conta comprometida',
          summary: 'Usuário suspenso',
        },
        {
          id: 1,
          occurredAt: '2026-11-13T12:00:00Z',
          action: 'ROLE_GRANTED',
          result: 'REFUSED',
          actor: { label: 'visitante' },
          summary: 'Tentativa recusada de conceder o perfil de administrador',
          refusalCode: 'ROOT_PROTECTED',
        },
      ],
    });
    const items = Array.from(el.querySelectorAll('[data-testid="recent-action"]'));

    expect(items).toHaveLength(2);
    expect(text(items[0])).toContain('Usuário suspenso');
    expect(text(items[0])).toContain('Ana Admin');
    expect(text(items[0])).toContain('14/11/2026 16:00');
    expect(text(items[0])).toContain('Conta comprometida');
    expect(text(items[1])).toContain('Tentativa recusada de conceder o perfil de administrador');
    expect(text(items[1])).toContain('Recusada');
    expect(text(items[1])).toContain('visitante');
  });

  it('sem ações registradas mostra o texto de ausência', async () => {
    const { el } = await setup();

    expect(text(el.querySelector('[data-testid="recent-actions-empty"]'))).toBe('Nenhuma ação administrativa registrada para esta conta.');
  });

  it('não mostra nada financeiro nem exportação', async () => {
    const { el } = await setup({ ...base, recentActions: [] });
    const content = text(el).toLowerCase();

    expect(content).not.toContain('exportar');
    for (const word of ['saldo', 'lançamento', 'cartão', 'transferência', 'categoria', 'conta bancária']) {
      expect(content).not.toContain(word);
    }
  });

  it('leva o foco ao título quando os dados chegam', async () => {
    const { el } = await setup();

    expect(document.activeElement).toBe(el.querySelector('[data-testid="detail-heading"]'));
  });

  it('usuário inexistente mostra a mensagem e o caminho de volta, sem tentar de novo', async () => {
    const { harness, el } = await setup('pending');
    detailRequest().flush({ status: 404, code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await settle(harness);

    expect(text(el.querySelector('[role="alert"]'))).toContain('Usuário não encontrado');
    expect(el.querySelector('a[href="/admin/users"]')).not.toBeNull();
  });

  it('falha do servidor mostra o erro com "Tentar novamente", que repete o pedido', async () => {
    const { harness, el } = await setup('pending');
    detailRequest().flush({ status: 500, code: 'INTERNAL_ERROR' }, { status: 500, statusText: 'Server Error' });
    await settle(harness);

    expect(el.querySelector('gef-error')).not.toBeNull();
    (el.querySelector('gef-error button') as HTMLButtonElement).click();
    detailRequest().flush(base);
    await settle(harness);
    sessionsRequest().flush([]);
    await settle(harness);

    expect(el.querySelector('gef-error')).toBeNull();
    expect(field(el, 'email')).toBe('ana@teste.com');
  });

  describe('ações por estado', () => {
    it('usuário ativo: suspender, conceder o perfil e redefinir senha, sem reativar nem retirar bloqueio', async () => {
      const { el } = await setup();

      expect(actionLabels(el)).toEqual([
        'Suspender conta',
        'Conceder perfil de administrador',
        'Trocar e-mail',
        'Reenviar e-mail de redefinição',
        'Forçar redefinição de senha',
        'Excluir conta',
      ]);
    });

    it('usuário suspenso: só reativar (e o perfil), sem suspender nem redefinir senha', async () => {
      const { el } = await setup({ ...base, suspended: true });

      expect(actionLabels(el)).toContain('Reativar conta');
      expect(actionLabels(el)).not.toContain('Suspender conta');
      expect(actionLabels(el)).not.toContain('Reenviar e-mail de redefinição');
      expect(actionLabels(el)).not.toContain('Forçar redefinição de senha');
    });

    it('bloqueio de login vigente: oferece retirar o bloqueio; sem bloqueio, não', async () => {
      const locked = await setup({ ...base, loginLock: { lockedUntil: '2026-11-14T19:20:00Z' } });
      expect(actionLabels(locked.el)).toContain('Retirar bloqueio de login');

      const free = await setup();
      expect(actionLabels(free.el)).not.toContain('Retirar bloqueio de login');
    });

    it('administrador comum: retirar o perfil em vez de conceder', async () => {
      const { el } = await setup({ ...base, role: 'ADMIN' });

      expect(actionLabels(el)).toContain('Retirar perfil de administrador');
      expect(actionLabels(el)).not.toContain('Conceder perfil de administrador');
    });

    it('administrador raiz: nenhum botão de ação, só o aviso de proteção', async () => {
      const { el } = await setup({ ...base, role: 'ROOT', protected: true, loginLock: { lockedUntil: '2026-11-14T19:20:00Z' } });

      expect(actionLabels(el)).toEqual([]);
      expect(text(el.querySelector('[data-testid="protected"]'))).toBe('Administrador raiz protegido');
      expect(text(el.querySelector('[data-testid="actions-protected"]'))).toContain('raiz');
    });

    it('o próprio administrador não se suspende nem altera o próprio perfil, mas pode retirar o bloqueio e reenviar redefinição', async () => {
      const { el } = await setup({ ...base, role: 'ADMIN', loginLock: { lockedUntil: '2026-11-14T19:20:00Z' } }, [], 7);

      expect(actionLabels(el)).toEqual(['Retirar bloqueio de login', 'Trocar e-mail', 'Reenviar e-mail de redefinição']);
      expect(text(el.querySelector('[data-testid="actions-self"]'))).toContain('própria conta');
    });

    it('o próprio usuário comum não altera o próprio perfil', async () => {
      const { el } = await setup({ ...base, role: 'USER' }, [], 7);

      expect(actionLabels(el)).not.toContain('Conceder perfil de administrador');
      expect(actionLabels(el)).not.toContain('Retirar perfil de administrador');
      expect(text(el.querySelector('[data-testid="actions-self"]'))).toContain('própria conta');
    });

    it('todo botão de ação tem texto e ícone', async () => {
      const { el } = await setup({ ...base, loginLock: { lockedUntil: '2026-11-14T19:20:00Z' } });
      const buttons = Array.from(el.querySelectorAll('[data-testid="actions"] button'));

      expect(buttons.length).toBeGreaterThanOrEqual(3);
      for (const button of buttons) {
        expect(text(button).length).toBeGreaterThan(0);
        expect(button.querySelector('gef-icon')).not.toBeNull();
      }
    });
  });

  describe('executar ações', () => {
    const confirmButton = (el: HTMLElement) => el.querySelector('[data-testid="confirm-confirm"]') as HTMLButtonElement;
    const dialog = (el: HTMLElement) => el.querySelector('[role="alertdialog"]');

    function typeInto(el: HTMLElement, selector: string, value: string) {
      const input = el.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }

    async function afterAction(harness: Awaited<ReturnType<typeof setup>>['harness'], updated: AdminUserDetail, sessions: AdminSession[] = []) {
      await settle(harness);
      detailRequest().flush(updated);
      sessionsRequest().flush(sessions);
      await settle(harness);
    }

    it('suspender pede o motivo, mostra o efeito, envia e recarrega detalhe e sessões', async () => {
      const { harness, el } = await setup();

      action(el, 'action-suspend')!.click();
      await settle(harness);
      expect(text(el.querySelector('[data-testid="action-effect"]'))).toContain('perde o acesso');
      confirmButton(el).click();
      await settle(harness);
      expect(text(el.querySelector('[data-testid="reason-error"]'))).toContain('Informe o motivo');
      http.expectNone((r) => r.method === 'POST');

      typeInto(el, '[data-testid="action-reason"]', '  Uso indevido  ');
      confirmButton(el).click();
      const req = http.expectOne((r) => r.method === 'POST' && r.url === `${URL}/suspend`);
      expect(req.request.body).toEqual({ reason: 'Uso indevido' });
      req.flush(null, { status: 204, statusText: 'No Content' });
      await afterAction(harness, { ...base, suspended: true, openSessions: 0 });

      expect(toast).toHaveBeenCalledWith('Conta suspensa.');
      expect(dialog(el)).toBeNull();
      expect(field(el, 'status')).toBe('Suspenso');
      expect(actionLabels(el)).toContain('Reativar conta');
      expect(text(el.querySelector('[role="status"][data-testid="action-status"]'))).toBe('Conta suspensa.');
    });

    it('depois da ação o foco volta ao título (o botão que abriu pode ter sumido)', async () => {
      const { harness, el } = await setup();
      action(el, 'action-suspend')!.click();
      await settle(harness);
      typeInto(el, '[data-testid="action-reason"]', 'Motivo');
      confirmButton(el).click();
      http.expectOne((r) => r.method === 'POST').flush(null, { status: 204, statusText: 'No Content' });
      await afterAction(harness, { ...base, suspended: true });

      expect(document.activeElement).toBe(el.querySelector('[data-testid="detail-heading"]'));
    });

    it('reativar não pede motivo, explica que as sessões antigas não voltam e recarrega', async () => {
      const { harness, el } = await setup({ ...base, suspended: true });

      action(el, 'action-reactivate')!.click();
      await settle(harness);
      expect(el.querySelector('[data-testid="action-reason"]')).toBeNull();
      expect(text(el.querySelector('[data-testid="action-effect"]'))).toContain('precisará entrar de novo');
      confirmButton(el).click();
      http.expectOne((r) => r.method === 'POST' && r.url === `${URL}/reactivate`).flush(null, { status: 204, statusText: 'No Content' });
      await afterAction(harness, base);

      expect(toast).toHaveBeenCalledWith('Conta reativada.');
      expect(field(el, 'status')).toBe('Ativo');
    });

    it('retirar o bloqueio de login chama a API e atualiza o bloqueio', async () => {
      const { harness, el } = await setup({ ...base, loginLock: { lockedUntil: '2026-11-14T19:20:00Z' } });

      action(el, 'action-unlock')!.click();
      await settle(harness);
      expect(text(el.querySelector('[data-testid="action-effect"]'))).toContain('IP');
      confirmButton(el).click();
      http.expectOne((r) => r.method === 'DELETE' && r.url === `${URL}/login-lock`).flush(null, { status: 204, statusText: 'No Content' });
      await afterAction(harness, base);

      expect(toast).toHaveBeenCalledWith('Bloqueio de login retirado.');
      expect(field(el, 'login-lock')).toBe('Sem bloqueio');
    });

    it('conceder o perfil exige a senha do administrador', async () => {
      const { harness, el } = await setup();

      action(el, 'action-grant')!.click();
      await settle(harness);
      expect(el.querySelector('[data-testid="action-reason"]')).toBeNull();
      confirmButton(el).click();
      await settle(harness);
      expect(text(el.querySelector('[data-testid="password-error"]'))).toContain('Informe sua senha');
      http.expectNone((r) => r.method === 'PUT');

      typeInto(el, '[data-testid="action-password"]', 'senha-forte-123');
      confirmButton(el).click();
      const req = http.expectOne((r) => r.method === 'PUT' && r.url === `${URL}/role`);
      expect(req.request.body).toEqual({ role: 'ADMIN', password: 'senha-forte-123' });
      req.flush(null, { status: 204, statusText: 'No Content' });
      await afterAction(harness, { ...base, role: 'ADMIN' });

      expect(toast).toHaveBeenCalledWith('Perfil de administrador concedido.');
      expect(actionLabels(el)).toContain('Retirar perfil de administrador');
    });

    it('retirar o perfil envia USER com a senha', async () => {
      const { harness, el } = await setup({ ...base, role: 'ADMIN' });

      action(el, 'action-revoke-role')!.click();
      await settle(harness);
      typeInto(el, '[data-testid="action-password"]', 'senha-forte-123');
      confirmButton(el).click();
      const req = http.expectOne((r) => r.method === 'PUT' && r.url === `${URL}/role`);
      expect(req.request.body).toEqual({ role: 'USER', password: 'senha-forte-123' });
      req.flush(null, { status: 204, statusText: 'No Content' });
      await afterAction(harness, base);

      expect(toast).toHaveBeenCalledWith('Perfil de administrador retirado.');
    });

    it('senha incorreta aparece dentro do diálogo, que não fecha, e nada é recarregado', async () => {
      const { harness, el } = await setup();
      action(el, 'action-grant')!.click();
      await settle(harness);
      typeInto(el, '[data-testid="action-password"]', 'errada');
      await settle(harness);
      confirmButton(el).click();

      http
        .expectOne((r) => r.method === 'PUT')
        .flush({ code: 'REAUTH_FAILED', detail: 'Senha incorreta.' }, { status: 403, statusText: 'Forbidden' });
      await settle(harness);

      expect(dialog(el)).not.toBeNull();
      expect(text(el.querySelector('[data-testid="confirm-error"]'))).toBe('Senha incorreta.');
      expect((el.querySelector('[data-testid="action-password"]') as HTMLInputElement).value).toBe('');
      expect(toast).not.toHaveBeenCalled();
      http.expectNone((r) => r.method === 'GET');
    });

    it('recusa de regra (409) mostra a mensagem do servidor no diálogo', async () => {
      const { harness, el } = await setup();
      action(el, 'action-suspend')!.click();
      await settle(harness);
      typeInto(el, '[data-testid="action-reason"]', 'Motivo');
      confirmButton(el).click();

      http
        .expectOne((r) => r.method === 'POST')
        .flush({ code: 'LAST_ADMIN', detail: 'O sistema precisa manter ao menos um administrador ativo.' }, { status: 409, statusText: 'Conflict' });
      await settle(harness);

      expect(text(el.querySelector('[data-testid="confirm-error"]'))).toBe('O sistema precisa manter ao menos um administrador ativo.');
      expect(dialog(el)).not.toBeNull();
    });

    it('erro de validação do motivo no servidor aparece no diálogo', async () => {
      const { harness, el } = await setup();
      action(el, 'action-suspend')!.click();
      await settle(harness);
      typeInto(el, '[data-testid="action-reason"]', 'Motivo');
      confirmButton(el).click();

      http
        .expectOne((r) => r.method === 'POST')
        .flush(
          { code: 'VALIDATION_ERROR', detail: 'Há campos inválidos.', errors: [{ field: 'reason', message: 'Informe o motivo da suspensão.' }] },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
      await settle(harness);

      expect(text(el.querySelector('[data-testid="confirm-error"]'))).toBe('Informe o motivo da suspensão.');
    });

    it('Cancelar fecha o diálogo sem chamar a API', async () => {
      const { harness, el } = await setup();
      action(el, 'action-suspend')!.click();
      await settle(harness);

      (el.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement).click();
      await settle(harness);

      expect(dialog(el)).toBeNull();
      http.expectNone((r) => r.method !== 'GET');
    });

    it('encerrar uma sessão pela lista recarrega o detalhe (contagem de sessões abertas)', async () => {
      const session: AdminSession = {
        id: '11111111-1111-1111-1111-111111111111',
        startedAt: '2026-11-14T19:00:00Z',
        lastUsedAt: '2026-11-14T19:30:00Z',
        current: false,
      };
      const { harness, el } = await setup(base, [session]);

      (el.querySelector('[data-testid="revoke-session"]') as HTMLButtonElement).click();
      await settle(harness);
      confirmButton(el).click();
      http.expectOne((r) => r.method === 'DELETE').flush(null, { status: 204, statusText: 'No Content' });
      await settle(harness);
      detailRequest().flush({ ...base, openSessions: 2 });
      sessionsRequest().flush([]);
      await settle(harness);

      expect(field(el, 'open-sessions')).toBe('2');
    });

    it('o administrador raiz tem a lista de sessões somente para leitura', async () => {
      const session: AdminSession = {
        id: '11111111-1111-1111-1111-111111111111',
        startedAt: '2026-11-14T19:00:00Z',
        lastUsedAt: '2026-11-14T19:30:00Z',
        current: false,
      };
      const { el } = await setup({ ...base, role: 'ROOT', protected: true }, [session]);

      expect(el.querySelector('[data-testid="session-row"]')).not.toBeNull();
      expect(el.querySelectorAll('[data-testid="session-row"] button')).toHaveLength(0);
      expect(el.querySelectorAll('[data-testid="actions"] button')).toHaveLength(0);
    });

    it('reenvia o e-mail de redefinição de senha e recarrega o detalhe', async () => {
      const { harness, el } = await setup();

      action(el, 'action-reset-send')!.click();
      await settle(harness);
      expect(text(el.querySelector('[data-testid="action-effect"]'))).toContain('novo link de redefinição de senha');
      confirmButton(el).click();
      http.expectOne((r) => r.method === 'POST' && r.url === `${URL}/password-reset/send`).flush(null, { status: 202, statusText: 'Accepted' });
      await settle(harness);
      detailRequest().flush(base);
      await settle(harness);

      expect(toast).toHaveBeenCalledWith('E-mail de redefinição enviado.');
      expect(text(el.querySelector('[role="status"][data-testid="action-status"]'))).toBe('E-mail de redefinição enviado.');
      expect(dialog(el)).toBeNull();
    });

    it('força a redefinição de senha pedindo a senha do administrador e recarrega detalhe e sessões', async () => {
      const { harness, el } = await setup();

      action(el, 'action-reset-force')!.click();
      await settle(harness);
      expect(text(el.querySelector('[data-testid="action-effect"]'))).toContain('deixam de valer imediatamente');
      typeInto(el, '[data-testid="action-password"]', 'senha-forte-123');
      confirmButton(el).click();
      const req = http.expectOne((r) => r.method === 'POST' && r.url === `${URL}/password-reset/force`);
      expect(req.request.body).toEqual({ password: 'senha-forte-123' });
      req.flush(null, { status: 202, statusText: 'Accepted' });
      await afterAction(harness, { ...base, openSessions: 0 });

      expect(toast).toHaveBeenCalledWith('Redefinição de senha forçada e e-mail enviado.');
      expect(field(el, 'open-sessions')).toBe('0');
      expect(dialog(el)).toBeNull();
    });

    it('falha no envio de e-mail (502 MAIL_DELIVERY_FAILED) mantém o diálogo aberto com a mensagem clara', async () => {
      const { harness, el } = await setup();

      action(el, 'action-reset-send')!.click();
      await settle(harness);
      confirmButton(el).click();
      http
        .expectOne((r) => r.method === 'POST' && r.url === `${URL}/password-reset/send`)
        .flush({ code: 'MAIL_DELIVERY_FAILED', detail: 'Não foi possível enviar o e-mail de redefinição. Nenhuma alteração foi aplicada.' }, { status: 502, statusText: 'Bad Gateway' });
      await settle(harness);

      expect(dialog(el)).not.toBeNull();
      expect(text(el.querySelector('[data-testid="confirm-error"]'))).toBe(
        'Não foi possível enviar o e-mail de redefinição. Nenhuma alteração foi aplicada.',
      );
      expect(toast).not.toHaveBeenCalled();
    });

    it('quando possui troca de e-mail pendente: exibe bloco de pendência e botões', async () => {
      const { el } = await setup({
        ...base,
        pendingEmailChange: { newEmail: 'novo@teste.com', expiresAt: '2026-11-14T20:00:00Z', attemptsLeft: 4 },
      });

      expect(el.querySelector('[data-testid="pending-email-change"]')).not.toBeNull();
      expect(text(el.querySelector('[data-testid="pending-new-email"]'))).toBe('novo@teste.com');
      expect(el.querySelector('[data-testid="open-email-confirm-btn"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="cancel-email-change-btn"]')).not.toBeNull();
      expect(text(action(el, 'action-email-change'))).toContain('Confirmar troca de e-mail');
    });

    it('solicitar troca de e-mail com sucesso fecha diálogo, exibe toast e recarrega', async () => {
      const { harness, el } = await setup();

      action(el, 'action-email-change')!.click();
      await settle(harness);

      const emailInput = el.querySelector('[data-testid="email-input"]') as HTMLInputElement;
      emailInput.value = 'novo@teste.com';
      emailInput.dispatchEvent(new Event('input'));
      await settle(harness);

      confirmButton(el).click();
      const req = http.expectOne((r) => r.method === 'POST' && r.url === `${URL}/email-change`);
      expect(req.request.body).toEqual({ newEmail: 'novo@teste.com' });
      req.flush(
        { newEmail: 'novo@teste.com', expiresAt: '2026-11-14T20:00:00Z', attemptsLeft: 5 },
        { status: 202, statusText: 'Accepted' },
      );
      await afterAction(harness, {
        ...base,
        pendingEmailChange: { newEmail: 'novo@teste.com', expiresAt: '2026-11-14T20:00:00Z', attemptsLeft: 5 },
      });

      expect(toast).toHaveBeenCalledWith('Código de confirmação enviado para o novo e-mail.');
      expect(el.querySelector('[data-testid="pending-email-change"]')).not.toBeNull();
    });

    it('confirmar troca de e-mail com sucesso fecha diálogo, exibe toast e atualiza e-mail', async () => {
      const { harness, el } = await setup({
        ...base,
        pendingEmailChange: { newEmail: 'confirmado@teste.com', expiresAt: '2026-11-14T20:00:00Z', attemptsLeft: 5 },
      });

      (el.querySelector('[data-testid="open-email-confirm-btn"]') as HTMLElement).click();
      await settle(harness);

      const codeInput = el.querySelector('[data-testid="code-input"]') as HTMLInputElement;
      codeInput.value = '123456';
      codeInput.dispatchEvent(new Event('input'));
      await settle(harness);

      confirmButton(el).click();
      const req = http.expectOne((r) => r.method === 'POST' && r.url === `${URL}/email-change/confirm`);
      expect(req.request.body).toEqual({ code: '123456' });
      req.flush(null, { status: 204, statusText: 'No Content' });
      await afterAction(harness, {
        ...base,
        email: 'confirmado@teste.com',
        pendingEmailChange: undefined,
      });

      expect(toast).toHaveBeenCalledWith('E-mail da conta alterado com sucesso.');
      expect(field(el, 'email')).toBe('confirmado@teste.com');
    });

    it('cancelar troca de e-mail pendente via botão exibe toast e recarrega', async () => {
      const { harness, el } = await setup({
        ...base,
        pendingEmailChange: { newEmail: 'cancelar@teste.com', expiresAt: '2026-11-14T20:00:00Z', attemptsLeft: 5 },
      });

      (el.querySelector('[data-testid="cancel-email-change-btn"]') as HTMLElement).click();
      const req = http.expectOne((r) => r.method === 'DELETE' && r.url === `${URL}/email-change`);
      req.flush(null, { status: 204, statusText: 'No Content' });
      await afterAction(harness, {
        ...base,
        pendingEmailChange: undefined,
      });

      expect(toast).toHaveBeenCalledWith('Troca de e-mail cancelada.');
    });
  });

  describe('alterar nome', () => {
    it('abre modal com nome atual e permite salvar novo nome', async () => {
      const { harness, el } = await setup({ ...base, name: 'Ana Souza' });

      (el.querySelector('[data-testid="action-rename"]') as HTMLElement).click();
      await settle(harness);

      const input = el.querySelector('[data-testid="rename-input"]') as HTMLInputElement;
      expect(input.value).toBe('Ana Souza');

      input.value = 'Ana Maria Souza';
      input.dispatchEvent(new Event('input'));
      await settle(harness);

      (el.querySelector('[data-testid="rename-save"]') as HTMLElement).click();
      const req = http.expectOne((r) => r.method === 'PATCH' && r.url === URL);
      expect(req.request.body).toEqual({ name: 'Ana Maria Souza' });
      req.flush(null, { status: 204, statusText: 'No Content' });

      await settle(harness);
      detailRequest().flush({ ...base, name: 'Ana Maria Souza' });
      await settle(harness);

      expect(toast).toHaveBeenCalledWith('Nome do usuário atualizado com sucesso.');
      expect(field(el, 'name')).toContain('Ana Maria Souza');
      expect(el.querySelector('[data-testid="rename-modal"]')).toBeNull();
    });

    it('permite limpar o nome enviando null', async () => {
      const { harness, el } = await setup({ ...base, name: 'Ana Souza' });

      (el.querySelector('[data-testid="action-rename"]') as HTMLElement).click();
      await settle(harness);

      const input = el.querySelector('[data-testid="rename-input"]') as HTMLInputElement;
      input.value = '   ';
      input.dispatchEvent(new Event('input'));
      await settle(harness);

      (el.querySelector('[data-testid="rename-save"]') as HTMLElement).click();
      const req = http.expectOne((r) => r.method === 'PATCH' && r.url === URL);
      expect(req.request.body).toEqual({ name: null });
      req.flush(null, { status: 204, statusText: 'No Content' });

      await settle(harness);
      detailRequest().flush({ ...base, name: undefined });
      await settle(harness);

      expect(toast).toHaveBeenCalledWith('Nome do usuário atualizado com sucesso.');
      expect(field(el, 'name')).toContain('Sem nome');
    });

    it('abre como painel opaco acessível (gef-sheet): diálogo modal, foco no campo, Escape fecha e some do DOM', async () => {
      const { harness, el } = await setup({ ...base, name: 'Ana' });

      (el.querySelector('[data-testid="action-rename"]') as HTMLElement).click();
      await settle(harness);

      const dialog = el.querySelector('.gef-sheet[role="dialog"]') as HTMLElement;
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-label')).toBe('Alterar nome');
      expect(dialog.contains(el.querySelector('[data-testid="rename-modal"]'))).toBe(true);
      expect(document.activeElement).toBe(el.querySelector('[data-testid="rename-input"]'));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await settle(harness);
      expect(el.querySelector('[data-testid="rename-modal"]')).toBeNull();
      expect(el.querySelector('.gef-sheet[aria-label="Alterar nome"]')).toBeNull();
    });

    it('exibe erro de validação retornado pela API', async () => {
      const { harness, el } = await setup({ ...base, name: 'Ana' });

      (el.querySelector('[data-testid="action-rename"]') as HTMLElement).click();
      await settle(harness);

      const input = el.querySelector('[data-testid="rename-input"]') as HTMLInputElement;
      input.value = 'X';
      input.dispatchEvent(new Event('input'));
      await settle(harness);

      (el.querySelector('[data-testid="rename-save"]') as HTMLElement).click();
      const req = http.expectOne((r) => r.method === 'PATCH' && r.url === URL);
      req.flush({ code: 'VALIDATION_ERROR', detail: 'Erro nos campos.', errors: [{ field: 'name', message: 'Nome inválido.' }] }, { status: 422, statusText: 'Unprocessable Entity' });
      await settle(harness);

      expect(text(el.querySelector('[data-testid="rename-error"]'))).toBe('Nome inválido.');
      expect(el.querySelector('[data-testid="rename-modal"]')).not.toBeNull();
    });
  });

  describe('exclusão de conta', () => {
    it('abrir exclusão busca os motivos e abre o diálogo', async () => {
      const { harness, el } = await setup();

      const btnDelete = el.querySelector('[data-testid="action-delete"]') as HTMLElement;
      expect(btnDelete).not.toBeNull();
      expect(btnDelete.textContent).toContain('Excluir conta');

      btnDelete.click();
      await settle(harness);

      const reqReasons = http.expectOne('/api/v1/admin/deletion-reasons');
      expect(reqReasons.request.method).toBe('GET');
      reqReasons.flush([{ id: 1, name: 'LGPD', message: 'Msg', active: true, initial: true }]);
      await settle(harness);

      expect(el.querySelector('[role="alertdialog"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="privacy-notice"]')).not.toBeNull();
    });

    it('usuário com exclusão agendada oferece antecipar e cancelar', async () => {
      const { harness, el } = await setup({
        ...base,
        deletionPending: true,
        deletion: { origin: 'ADMIN', requestedAt: '2026-10-01T12:00:00Z', dueAt: '2026-11-01T12:00:00Z', reasonName: 'LGPD', noticeState: 'SENT' },
      });

      const btnAnticipate = el.querySelector('[data-testid="action-delete"]') as HTMLElement;
      expect(btnAnticipate.textContent).toContain('Antecipar exclusão');

      const btnCancel = el.querySelector('[data-testid="action-cancel-deletion"]') as HTMLElement;
      expect(btnCancel.textContent).toContain('Cancelar exclusão');

      btnCancel.click();
      await settle(harness);

      const reqCancel = http.expectOne('/api/v1/admin/users/7/deletion');
      expect(reqCancel.request.method).toBe('DELETE');
      reqCancel.flush(null);
      await settle(harness);

      detailRequest().flush({ ...base, deletionPending: false, deletion: undefined });
      await settle(harness);

      expect(toast).toHaveBeenCalledWith('Exclusão agendada cancelada.');
    });
  });
});
