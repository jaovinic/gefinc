import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AdminUserPage, AdminUserRow } from '@gefinc/core-models';
import { API_BASE_URL, CurrentUser, NoticeService } from '@gefinc/ui-shared';
import { optionLabels, pickOption } from '@gefinc/ui-shared/testing';
import { Subject } from 'rxjs';
import { AdminApi } from '../admin.api';
import { UserList } from './user-list';

const URL = '/api/v1/admin/users';

const ana: AdminUserRow = {
  id: 1,
  email: 'ana@teste.com',
  name: 'Ana Souza',
  createdAt: '2026-11-14T02:30:00Z',
  lastAccessAt: '2026-11-14T19:05:00Z',
  role: 'USER',
  suspended: false,
  deletionPending: false,
};
const bruno: AdminUserRow = { ...ana, id: 2, email: 'bruno@teste.com', name: undefined, lastAccessAt: undefined, suspended: true };
const carla: AdminUserRow = { ...ana, id: 3, email: 'carla@teste.com', name: 'Carla', deletionPending: true };
const diego: AdminUserRow = { ...ana, id: 4, email: 'diego@teste.com', name: 'Diego', role: 'ADMIN' };
const raiz: AdminUserRow = { ...ana, id: 5, email: 'raiz@teste.com', name: 'Raiz', role: 'ROOT' };

function page(content: AdminUserRow[], overrides: Partial<AdminUserPage> = {}): AdminUserPage {
  return {
    content,
    page: 0,
    size: 25,
    totalElements: content.length,
    counts: { active: 3, suspended: 1, deletionPending: 1, admin: 2 },
    ...overrides,
  };
}

describe('UserList', () => {
  let http: HttpTestingController;

  async function setup(first: AdminUserPage | 'pending' = page([ana, bruno, carla, diego, raiz])) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1' },
        { provide: CurrentUser, useValue: { clear: jest.fn(), load: jest.fn() } },
        { provide: NoticeService, useValue: { toast: jest.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(UserList);
    fixture.detectChanges();
    if (first !== 'pending') {
      listRequest().flush(first);
      await settle(fixture);
    }
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const listRequest = () => http.expectOne((r) => r.method === 'GET' && r.url === URL);
  const rows = (el: HTMLElement) => Array.from(el.querySelectorAll('[data-testid="user-row"]'));
  const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  function typeSearch(el: HTMLElement, value: string) {
    const input = el.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  afterEach(() => {
    jest.useRealTimers();
    http.verify();
  });

  it('abre pedindo a primeira página (25, criação decrescente) e mostra o carregamento', async () => {
    const { fixture, el } = await setup('pending');

    expect(el.querySelector('gef-loading')).not.toBeNull();
    const req = listRequest();
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('25');
    expect(req.request.params.get('sort')).toBe('createdAt');
    expect(req.request.params.get('dir')).toBe('desc');
    expect(req.request.params.has('q')).toBe(false);
    expect(req.request.params.has('status')).toBe(false);
    req.flush(page([ana]));
    await settle(fixture);
    expect(el.querySelector('gef-loading')).toBeNull();
  });

  it('lista e-mail, nome, situação em texto e ícone, criação e último acesso (horário de Brasília)', async () => {
    const { el } = await setup();
    const [first, second] = rows(el);

    expect(rows(el)).toHaveLength(5);
    expect(text(first)).toContain('ana@teste.com');
    expect(text(first)).toContain('Ana Souza');
    expect(text(first)).toContain('13/11/2026 23:30');
    expect(text(first)).toContain('14/11/2026 16:05');
    expect(text(first.querySelector('[data-testid="status"]'))).toBe('Ativo');
    expect(first.querySelector('[data-testid="status"] gef-icon')).not.toBeNull();
    expect(text(second)).toContain('Sem nome');
    expect(text(second)).toContain('Nunca acessou');
    expect(text(second.querySelector('[data-testid="status"]'))).toBe('Suspenso');
    expect(second.querySelector('[data-testid="status"] gef-icon')).not.toBeNull();
  });

  it('mostra aguardando exclusão e o perfil de administrador e de raiz também em texto', async () => {
    const { el } = await setup();
    const [, , third, fourth, fifth] = rows(el);

    expect(text(third.querySelector('[data-testid="status"]'))).toBe('Aguardando exclusão');
    expect(third.querySelector('[data-testid="status"] gef-icon')).not.toBeNull();
    expect(text(fourth.querySelector('[data-testid="role"]'))).toBe('Administrador');
    expect(text(fifth.querySelector('[data-testid="role"]'))).toBe('Administrador raiz');
    expect(fourth.querySelector('[data-testid="role"] gef-icon')).not.toBeNull();
  });

  it('cada linha leva ao detalhe do usuário', async () => {
    const { el } = await setup();
    const link = rows(el)[0].querySelector('a') as HTMLAnchorElement;

    expect(link.getAttribute('href')).toBe('/admin/users/1');
  });

  it('mostra as contagens por situação', async () => {
    const { el } = await setup();
    const counts = text(el.querySelector('[data-testid="counts"]'));

    expect(counts).toContain('Ativos 3');
    expect(counts).toContain('Suspensos 1');
    expect(counts).toContain('Aguardando exclusão 1');
    expect(counts).toContain('Administradores 2');
  });

  it('o campo de busca tem rótulo visível associado', async () => {
    const { el } = await setup();
    const input = el.querySelector('input[type="search"]') as HTMLInputElement;
    const label = el.querySelector(`label[for="${input.id}"]`);

    expect(input.id).not.toBe('');
    expect(text(label)).toBe('Buscar por e-mail ou nome');
    expect(input.getAttribute('maxlength')).toBe('100');
  });

  it('a busca espera 300 ms de pausa, manda só o último texto e volta para a primeira página', async () => {
    const { fixture, el } = await setup(page([ana], { totalElements: 60 }));
    jest.useFakeTimers();

    typeSearch(el, 'jo');
    jest.advanceTimersByTime(200);
    typeSearch(el, 'joa');
    jest.advanceTimersByTime(299);
    http.expectNone((r) => r.url === URL);
    jest.advanceTimersByTime(1);

    const req = listRequest();
    expect(req.request.params.get('q')).toBe('joa');
    expect(req.request.params.get('page')).toBe('0');
    req.flush(page([ana]));
    await settle(fixture);
  });

  it('busca em branco não manda q (e igual à anterior não repete o pedido)', async () => {
    const { fixture, el } = await setup();
    jest.useFakeTimers();

    typeSearch(el, '   ');
    jest.advanceTimersByTime(300);
    http.expectNone((r) => r.url === URL);

    typeSearch(el, 'ab');
    jest.advanceTimersByTime(300);
    listRequest().flush(page([ana]));
    await settle(fixture);
    typeSearch(el, '   ');
    jest.advanceTimersByTime(300);

    expect(listRequest().request.params.has('q')).toBe(false);
  });

  it('filtro de situação pede a situação escolhida e volta para a primeira página', async () => {
    const { fixture, el } = await setup(page([ana], { totalElements: 60 }));

    pickOption(fixture, 'Situação', 'Suspensos');

    const req = listRequest();
    expect(req.request.params.get('status')).toBe('SUSPENDED');
    expect(req.request.params.get('page')).toBe('0');
    req.flush(page([bruno]));
    await settle(fixture);
    expect(rows(el)).toHaveLength(1);
  });

  it('oferece as quatro situações e "Todas"', async () => {
    const { fixture } = await setup();

    expect(optionLabels(fixture, 'Situação')).toEqual(['Todas as situações', 'Ativos', 'Suspensos', 'Aguardando exclusão', 'Administradores']);
  });

  it('ordenação por último acesso e por ordem pede sort e dir', async () => {
    const { fixture } = await setup();

    pickOption(fixture, 'Ordenar por', 'Último acesso');
    const bySort = listRequest();
    expect(bySort.request.params.get('sort')).toBe('lastAccessAt');
    bySort.flush(page([ana]));
    await settle(fixture);

    pickOption(fixture, 'Ordem', 'Mais antigos primeiro');
    const byDir = listRequest();
    expect(byDir.request.params.get('dir')).toBe('asc');
    expect(byDir.request.params.get('sort')).toBe('lastAccessAt');
    byDir.flush(page([ana]));
    await settle(fixture);
  });

  it('paginação mostra "Página X de Y", pede a próxima e leva o foco para o resultado', async () => {
    const { fixture, el } = await setup(page([ana], { totalElements: 60 }));
    const pager = el.querySelector('nav[aria-label="Paginação"]') as HTMLElement;
    const [previous, next] = Array.from(pager.querySelectorAll('button')) as HTMLButtonElement[];

    expect(text(pager)).toContain('Página 1 de 3');
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    next.click();
    const req = listRequest();
    expect(req.request.params.get('page')).toBe('1');
    req.flush(page([bruno], { page: 1, totalElements: 60 }));
    await settle(fixture);

    expect(text(el.querySelector('nav[aria-label="Paginação"]'))).toContain('Página 2 de 3');
    expect(document.activeElement).toBe(el.querySelector('[data-testid="results-heading"]'));
  });

  it('na última página "Próxima" fica desabilitada', async () => {
    const { el } = await setup(page([ana], { page: 2, totalElements: 60 }));
    const buttons = Array.from(el.querySelectorAll('nav[aria-label="Paginação"] button')) as HTMLButtonElement[];

    expect(buttons[0].disabled).toBe(false);
    expect(buttons[1].disabled).toBe(true);
  });

  it('anuncia o resultado numa região de estado (role=status)', async () => {
    const { el } = await setup(page([ana, bruno], { totalElements: 2 }));
    const status = el.querySelector('[data-testid="result-status"]') as HTMLElement;

    expect(status.getAttribute('role')).toBe('status');
    expect(text(status)).toBe('2 usuários encontrados. Página 1 de 1.');
  });

  it('anuncia o singular', async () => {
    const { el } = await setup(page([ana], { totalElements: 1 }));

    expect(text(el.querySelector('[data-testid="result-status"]'))).toBe('1 usuário encontrado. Página 1 de 1.');
  });

  it('sem resultados mostra o estado vazio com "Limpar filtros", que refaz a lista sem filtros', async () => {
    const { fixture, el } = await setup();
    jest.useFakeTimers();
    typeSearch(el, 'ninguem');
    jest.advanceTimersByTime(300);
    listRequest().flush(page([], { counts: { active: 0, suspended: 0, deletionPending: 0, admin: 0 } }));
    await settle(fixture);

    expect(el.querySelector('gef-empty')).not.toBeNull();
    expect(text(el.querySelector('[data-testid="result-status"]'))).toBe('Nenhum usuário encontrado.');
    const clear = Array.from(el.querySelectorAll('gef-empty button')).find((b) => text(b) === 'Limpar filtros') as HTMLButtonElement;
    clear.click();

    const req = listRequest();
    expect(req.request.params.has('q')).toBe(false);
    expect(req.request.params.has('status')).toBe(false);
    fixture.detectChanges();
    expect((el.querySelector('input[type="search"]') as HTMLInputElement).value).toBe('');
    req.flush(page([ana]));
    await settle(fixture);
    expect(rows(el)).toHaveLength(1);
  });

  it('falha mostra o erro com "Tentar novamente", que repete o pedido', async () => {
    const { fixture, el } = await setup('pending');
    listRequest().flush({ status: 500, code: 'INTERNAL_ERROR' }, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    expect(el.querySelector('gef-error')).not.toBeNull();
    expect(el.querySelector('table')).toBeNull();
    (el.querySelector('gef-error button') as HTMLButtonElement).click();
    listRequest().flush(page([ana]));
    await settle(fixture);

    expect(el.querySelector('gef-error')).toBeNull();
    expect(rows(el)).toHaveLength(1);
  });

  it('sem conexão mostra a variante offline do erro', async () => {
    const { fixture, el } = await setup('pending');
    listRequest().error(new ProgressEvent('error'));
    await settle(fixture);

    expect(el.querySelector('gef-error [data-variant="offline"]')).not.toBeNull();
  });

  it('não oferece exportar nem mostra nada financeiro', async () => {
    const { el } = await setup();
    const content = text(el).toLowerCase();

    expect(content).not.toContain('exportar');
    expect(content).not.toContain('csv');
    expect(el.querySelector('[download]')).toBeNull();
    for (const word of ['saldo', 'lançamento', 'cartão', 'transferência', 'categoria']) {
      expect(content).not.toContain(word);
    }
  });

  it('não usa tabindex positivo', async () => {
    const { el } = await setup();
    const positive = Array.from(el.querySelectorAll('[tabindex]')).filter((n) => Number(n.getAttribute('tabindex')) > 0);

    expect(positive).toHaveLength(0);
  });
});

describe('UserList: respostas fora de ordem', () => {
  afterEach(() => jest.useRealTimers());

  it('descarta a resposta obsoleta: o primeiro pedido termina depois do segundo e a lista mostra o segundo', async () => {
    const first = new Subject<AdminUserPage>();
    const second = new Subject<AdminUserPage>();
    const listUsers = jest.fn().mockReturnValueOnce(first.asObservable()).mockReturnValueOnce(second.asObservable());
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminApi, useValue: { listUsers } }],
    });
    const fixture = TestBed.createComponent(UserList);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    expect(listUsers).toHaveBeenCalledTimes(1);

    // Segundo pedido enquanto o primeiro ainda está pendente (troca de situação).
    (fixture.componentInstance as unknown as { onStatus(value: string): void }).onStatus('SUSPENDED');
    expect(listUsers).toHaveBeenCalledTimes(2);

    second.next(page([bruno]));
    second.complete();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(Array.from(el.querySelectorAll('[data-testid="user-row"]')).map((r) => r.textContent)).toEqual([expect.stringContaining('bruno@teste.com')]);

    // O primeiro termina depois: a resposta antiga não pode sobrescrever a lista atual.
    first.next(page([ana, carla]));
    first.complete();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const rowsAfter = Array.from(el.querySelectorAll('[data-testid="user-row"]'));
    expect(rowsAfter).toHaveLength(1);
    expect(rowsAfter[0].textContent).toContain('bruno@teste.com');
    expect(el.textContent).not.toContain('ana@teste.com');
  });
});
