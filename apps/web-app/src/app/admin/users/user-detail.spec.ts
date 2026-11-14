import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { AdminUserDetail } from '@gefinc/core-models';
import { API_BASE_URL, CurrentUser, NoticeService } from '@gefinc/ui-shared';
import { UserDetail } from './user-detail';

const URL = '/api/v1/admin/users/7';

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

  async function setup(first: AdminUserDetail | 'pending' = base) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'admin/users/:id', component: UserDetail }, { path: 'admin/users', component: UserDetail }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1' },
        { provide: CurrentUser, useValue: { clear: jest.fn(), load: jest.fn() } },
        { provide: NoticeService, useValue: { toast: jest.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/users/7');
    harness.fixture.detectChanges();
    if (first !== 'pending') {
      detailRequest().flush(first);
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
  const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const field = (el: HTMLElement, id: string) => text(el.querySelector(`[data-testid="${id}"]`));

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

  it('não tem botões de ação nem nada financeiro nem exportação', async () => {
    const { el } = await setup({ ...base, recentActions: [] });
    const content = text(el).toLowerCase();

    expect(el.querySelectorAll('button')).toHaveLength(0);
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

    expect(el.querySelector('gef-error')).toBeNull();
    expect(field(el, 'email')).toBe('ana@teste.com');
  });
});
