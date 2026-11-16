import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AuditEntry, AuditPage } from '@gefinc/core-models';
import { API_BASE_URL, CurrentUser, NoticeService } from '@gefinc/ui-shared';
import { pickOption } from '@gefinc/ui-shared/testing';
import { Subject } from 'rxjs';
import { AdminApi } from '../admin.api';
import { AuditList } from './audit-list';

const URL = '/api/v1/admin/audit';

const entrySuspended: AuditEntry = {
  id: 101,
  occurredAt: '2026-11-14T15:30:00Z',
  action: 'USER_SUSPENDED',
  result: 'SUCCESS',
  actor: { userId: 1, label: 'Ana Administradora' },
  target: { userId: 7, label: 'bruno@teste.com' },
  summary: 'Usuário suspenso',
};

const entryRefused: AuditEntry = {
  id: 102,
  occurredAt: '2026-11-14T14:00:00Z',
  action: 'USER_SUSPENDED',
  result: 'REFUSED',
  actor: { userId: 2, label: 'adm.b@teste.com' },
  target: { userId: 99, label: 'anônimo-1a2b3c4d' },
  refusalCode: 'LAST_ADMIN',
  summary: 'Tentativa recusada de suspender o usuário',
};

const entryVisitor: AuditEntry = {
  id: 103,
  occurredAt: '2026-11-14T13:00:00Z',
  action: 'ACCESS_DENIED',
  result: 'REFUSED',
  actor: { label: 'visitante' },
  subject: 'GET /admin/users',
  refusalCode: 'FORBIDDEN',
  summary: 'Acesso ao painel negado',
};

function page(content: AuditEntry[], nextCursor?: string): AuditPage {
  return nextCursor ? { content, nextCursor } : { content };
}

describe('AuditList', () => {
  let http: HttpTestingController;

  async function setup(first: AuditPage | 'pending' = page([entrySuspended, entryRefused, entryVisitor])) {
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
    const fixture = TestBed.createComponent(AuditList);
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
  const detailRequest = (id: number) => http.expectOne((r) => r.method === 'GET' && r.url === `${URL}/${id}`);
  const rows = (el: HTMLElement) => Array.from(el.querySelectorAll('[data-testid="audit-row"]'));
  const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  afterEach(() => {
    http.verify();
  });

  it('abre pedindo os primeiros 50 registros e mostra o estado de carregamento', async () => {
    const { fixture, el } = await setup('pending');

    expect(el.querySelector('gef-loading')).not.toBeNull();
    const req = listRequest();
    expect(req.request.params.get('limit')).toBe('50');
    expect(req.request.params.has('cursor')).toBe(false);
    expect(req.request.params.has('action')).toBe(false);
    expect(req.request.params.has('result')).toBe(false);
    req.flush(page([entrySuspended]));
    await settle(fixture);

    expect(el.querySelector('gef-loading')).toBeNull();
    expect(rows(el)).toHaveLength(1);
  });

  it('mostra data/hora em Brasília, resumo, autor, alvo (com anônimo-… sem link) e resultado em texto e ícone', async () => {
    const { el } = await setup();
    const [first, second, third] = rows(el);

    expect(text(first.querySelector('[data-testid="occurred-at"]'))).toBe('14/11/2026 12:30');
    expect(text(first.querySelector('[data-testid="summary"]'))).toBe('Usuário suspenso');
    expect(text(first.querySelector('[data-testid="actor"]'))).toBe('Ana Administradora');
    expect(first.querySelector('[data-testid="actor"] a')?.getAttribute('href')).toBe('/admin/users/1');
    expect(text(first.querySelector('[data-testid="target"]'))).toBe('bruno@teste.com');
    expect(first.querySelector('[data-testid="target"] a')?.getAttribute('href')).toBe('/admin/users/7');
    expect(text(first.querySelector('[data-testid="result"]'))).toBe('Sucesso');
    expect(first.querySelector('[data-testid="result"] gef-icon')).not.toBeNull();

    // Conta removida exibe anônimo-<8 hex> como texto simples, sem link para usuário inexistente
    expect(text(second.querySelector('[data-testid="target"]'))).toBe('anônimo-1a2b3c4d');
    expect(second.querySelector('[data-testid="target"] a')).toBeNull();
    expect(text(second.querySelector('[data-testid="summary"]'))).toContain('LAST_ADMIN');
    expect(text(second.querySelector('[data-testid="result"]'))).toBe('Recusada');

    // Visitante e assunto não-usuário
    expect(text(third.querySelector('[data-testid="actor"]'))).toBe('visitante');
    expect(third.querySelector('[data-testid="actor"] a')).toBeNull();
    expect(text(third.querySelector('[data-testid="target"]'))).toBe('GET /admin/users');
  });

  it('filtra por ação, resultado, período (de/até), autor e alvo', async () => {
    const { fixture, el } = await setup();

    pickOption(fixture, 'Ação', 'Usuário suspenso');
    const byAction = listRequest();
    expect(byAction.request.params.get('action')).toBe('USER_SUSPENDED');
    byAction.flush(page([entrySuspended]));
    await settle(fixture);

    pickOption(fixture, 'Resultado', 'Recusada');
    const byResult = listRequest();
    expect(byResult.request.params.get('result')).toBe('REFUSED');
    byResult.flush(page([entryRefused]));
    await settle(fixture);

    const fromInput = el.querySelector('[data-testid="filter-from"]') as HTMLInputElement;
    fromInput.value = '2026-11-10';
    fromInput.dispatchEvent(new Event('change'));
    const byFrom = listRequest();
    expect(byFrom.request.params.get('from')).toBe('2026-11-10T00:00:00Z');
    byFrom.flush(page([entryRefused]));
    await settle(fixture);

    const toInput = el.querySelector('[data-testid="filter-to"]') as HTMLInputElement;
    toInput.value = '2026-11-14';
    toInput.dispatchEvent(new Event('change'));
    const byTo = listRequest();
    expect(byTo.request.params.get('to')).toBe('2026-11-15T00:00:00Z');
    byTo.flush(page([entryRefused]));
    await settle(fixture);

    const actorInput = el.querySelector('[data-testid="filter-actor"]') as HTMLInputElement;
    actorInput.value = '2';
    actorInput.dispatchEvent(new Event('change'));
    const byActor = listRequest();
    expect(byActor.request.params.get('actorId')).toBe('2');
    byActor.flush(page([entryRefused]));
    await settle(fixture);

    const targetInput = el.querySelector('[data-testid="filter-target"]') as HTMLInputElement;
    targetInput.value = '99';
    targetInput.dispatchEvent(new Event('change'));
    const byTarget = listRequest();
    expect(byTarget.request.params.get('targetUserId')).toBe('99');
    byTarget.flush(page([entryRefused]));
    await settle(fixture);
  });

  it('paginação por cursor mostra "Carregar mais", anexa os novos registros e esconde o botão no fim', async () => {
    const { fixture, el } = await setup(page([entrySuspended], 'cursor-p2'));

    expect(rows(el)).toHaveLength(1);
    const loadMoreBtn = el.querySelector('[data-testid="load-more"]') as HTMLButtonElement;
    expect(loadMoreBtn).not.toBeNull();
    expect(text(loadMoreBtn)).toBe('Carregar mais');

    loadMoreBtn.click();
    const req = listRequest();
    expect(req.request.params.get('cursor')).toBe('cursor-p2');
    expect(req.request.params.get('limit')).toBe('50');
    req.flush(page([entryRefused, entryVisitor]));
    await settle(fixture);

    expect(rows(el)).toHaveLength(3);
    expect(el.querySelector('[data-testid="load-more"]')).toBeNull();
    expect(text(el.querySelector('[data-testid="result-status"]'))).toBe('3 registros exibidos.');
  });

  it('expande o detalhe de uma linha buscando GET /admin/audit/{id} com justificativa, detalhes e origem (client)', async () => {
    const { fixture, el } = await setup(page([entrySuspended]));

    const toggle = el.querySelector('[data-testid="toggle-detail"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const req = detailRequest(101);
    req.flush({
      ...entrySuspended,
      reason: 'Chamado de segurança 42',
      details: { from: 'ACTIVE', to: 'SUSPENDED' },
      client: { ref: 'anônimo-abcdef12', ip: '203.0.113.77', device: 'Firefox em Linux' },
    });
    await settle(fixture);

    const detail = el.querySelector('[data-testid="audit-detail"]') as HTMLElement;
    expect(detail).not.toBeNull();
    expect(text(detail.querySelector('[data-testid="detail-reason"]'))).toBe('Chamado de segurança 42');
    expect(text(detail.querySelector('[data-testid="detail-changes"]'))).toContain('De: ACTIVE');
    expect(text(detail.querySelector('[data-testid="detail-changes"]'))).toContain('Para: SUSPENDED');
    expect(text(detail.querySelector('[data-testid="detail-client-ref"]'))).toContain('anônimo-abcdef12');
    expect(text(detail.querySelector('[data-testid="detail-client-ip"]'))).toContain('203.0.113.77');
    expect(text(detail.querySelector('[data-testid="detail-client-device"]'))).toContain('Firefox em Linux');

    toggle.click();
    await settle(fixture);
    expect(el.querySelector('[data-testid="audit-detail"]')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('sem resultados mostra o estado vazio com "Limpar filtros", que recarrega sem filtros', async () => {
    const { fixture, el } = await setup(page([]));

    expect(el.querySelector('gef-empty')).not.toBeNull();
    expect(text(el.querySelector('[data-testid="result-status"]'))).toBe('Nenhum registro encontrado.');

    const clearBtn = el.querySelector('gef-empty button') as HTMLButtonElement;
    clearBtn.click();
    listRequest().flush(page([entrySuspended]));
    await settle(fixture);

    expect(el.querySelector('gef-empty')).toBeNull();
    expect(rows(el)).toHaveLength(1);
  });

  it('falha no carregamento mostra erro com "Tentar novamente"', async () => {
    const { fixture, el } = await setup('pending');
    listRequest().flush({ status: 500, code: 'INTERNAL_ERROR' }, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    expect(el.querySelector('gef-error')).not.toBeNull();
    expect(el.querySelector('table')).toBeNull();
    (el.querySelector('gef-error button') as HTMLButtonElement).click();
    listRequest().flush(page([entrySuspended]));
    await settle(fixture);

    expect(el.querySelector('gef-error')).toBeNull();
    expect(rows(el)).toHaveLength(1);
  });

  it('não oferece controles de editar, excluir ou exportar e não usa tabindex positivo', async () => {
    const { el } = await setup();
    const content = text(el).toLowerCase();

    expect(content).not.toContain('exportar');
    expect(content).not.toContain('csv');
    expect(content).not.toContain('editar');
    expect(content).not.toContain('excluir');
    expect(content).not.toContain('apagar');
    expect(el.querySelector('[download]')).toBeNull();
    const positive = Array.from(el.querySelectorAll('[tabindex]')).filter((n) => Number(n.getAttribute('tabindex')) > 0);
    expect(positive).toHaveLength(0);
  });
});

describe('AuditList: respostas fora de ordem', () => {
  it('descarta a resposta obsoleta quando um novo filtro é aplicado antes da primeira resposta chegar', async () => {
    const first = new Subject<AuditPage>();
    const second = new Subject<AuditPage>();
    const listAudit = jest.fn().mockReturnValueOnce(first.asObservable()).mockReturnValueOnce(second.asObservable());
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminApi, useValue: { listAudit } }],
    });
    const fixture = TestBed.createComponent(AuditList);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    expect(listAudit).toHaveBeenCalledTimes(1);

    (fixture.componentInstance as unknown as { onResult(value: string): void }).onResult('REFUSED');
    expect(listAudit).toHaveBeenCalledTimes(2);

    second.next(page([entryRefused]));
    second.complete();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="audit-row"]')).toHaveLength(1);
    expect(el.textContent).toContain('anônimo-1a2b3c4d');

    first.next(page([entrySuspended]));
    first.complete();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="audit-row"]')).toHaveLength(1);
    expect(el.textContent).not.toContain('bruno@teste.com');
  });
});
