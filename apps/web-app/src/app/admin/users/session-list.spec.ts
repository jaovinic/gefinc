import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AdminSession } from '@gefinc/core-models';
import { API_BASE_URL, CurrentUser, NoticeService } from '@gefinc/ui-shared';
import { SessionList } from './session-list';

const URL = '/api/v1/admin/users/7/sessions';

const recent: AdminSession = {
  id: '11111111-1111-1111-1111-111111111111',
  startedAt: '2026-11-14T19:00:00Z',
  lastUsedAt: '2026-11-14T19:30:00Z',
  ip: '203.0.113.7',
  device: 'Chrome em Windows',
  current: false,
};
const older: AdminSession = {
  id: '22222222-2222-2222-2222-222222222222',
  startedAt: '2026-11-10T12:00:00Z',
  lastUsedAt: '2026-11-10T12:05:00Z',
  current: false,
};
const mine: AdminSession = { ...recent, id: '33333333-3333-3333-3333-333333333333', current: true };

@Component({
  imports: [SessionList],
  template: `<gef-admin-session-list [userId]="7" [refresh]="refresh()" [readonly]="readonly()" (changed)="changed()" />`,
})
class Host {
  readonly refresh = signal(0);
  readonly readonly = signal(false);
  readonly changed = jest.fn();
}

describe('SessionList', () => {
  let http: HttpTestingController;
  let toast: jest.Mock;

  async function setup(first: AdminSession[] | 'pending' = [recent, older], configure?: (host: Host) => void) {
    TestBed.resetTestingModule();
    toast = jest.fn();
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
    const fixture = TestBed.createComponent(Host);
    configure?.(fixture.componentInstance);
    fixture.detectChanges();
    if (first !== 'pending') {
      listRequest().flush(first);
      await settle(fixture);
    }
    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const listRequest = () => http.expectOne((r) => r.method === 'GET' && r.url === URL);
  const rows = (el: HTMLElement) => Array.from(el.querySelectorAll('[data-testid="session-row"]'));
  const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const button = (el: ParentNode, testId: string) => el.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null;

  afterEach(() => http.verify());

  it('mostra o carregamento enquanto a lista não chega', async () => {
    const { fixture, el } = await setup('pending');
    expect(el.querySelector('gef-loading')).not.toBeNull();

    listRequest().flush([recent]);
    await settle(fixture);
    expect(el.querySelector('gef-loading')).toBeNull();
    expect(rows(el)).toHaveLength(1);
  });

  it('lista início e último uso no horário de Brasília, dispositivo e IP', async () => {
    const { el } = await setup();
    const [first, second] = rows(el);

    expect(rows(el)).toHaveLength(2);
    expect(text(first)).toContain('14/11/2026 16:00');
    expect(text(first)).toContain('14/11/2026 16:30');
    expect(text(first)).toContain('Chrome em Windows');
    expect(text(first)).toContain('203.0.113.7');
    expect(text(second)).toContain('Não informado');
    expect(el.querySelectorAll('th').length).toBeGreaterThanOrEqual(5);
    expect(el.querySelector('caption')?.textContent).toContain('Sessões abertas');
  });

  it('a sessão do próprio solicitante é identificada em texto e não tem botão Encerrar', async () => {
    const { el } = await setup([mine, older]);
    const [first, second] = rows(el);

    expect(text(first)).toContain('Esta sessão');
    expect(button(first, 'revoke-session')).toBeNull();
    expect(button(second, 'revoke-session')).not.toBeNull();
  });

  it('sem sessões abertas mostra o texto de ausência e nenhum botão', async () => {
    const { el } = await setup([]);

    expect(text(el.querySelector('[data-testid="sessions-empty"]'))).toBe('Nenhuma sessão aberta.');
    expect(button(el, 'revoke-all')).toBeNull();
  });

  it('só oferece "Encerrar todas" quando nenhuma sessão é a do solicitante', async () => {
    const withMine = await setup([mine, older]);
    expect(button(withMine.el, 'revoke-all')).toBeNull();

    const without = await setup([recent, older]);
    expect(button(without.el, 'revoke-all')).not.toBeNull();
  });

  it('somente leitura (administrador raiz): lista sem nenhum botão', async () => {
    const { el } = await setup([recent], (h) => h.readonly.set(true));

    expect(rows(el)).toHaveLength(1);
    expect(el.querySelectorAll('button')).toHaveLength(0);
  });

  it('Encerrar abre o diálogo com o efeito em texto e só encerra ao confirmar', async () => {
    const { fixture, host, el } = await setup();

    button(rows(el)[0], 'revoke-session')!.click();
    await settle(fixture);
    const dialog = el.querySelector('[role="alertdialog"]') as HTMLElement;

    expect(dialog).not.toBeNull();
    expect(text(el.querySelector('[data-testid="action-effect"]'))).toContain('na próxima ação');
    http.expectNone((r) => r.method === 'DELETE');

    (el.querySelector('[data-testid="confirm-confirm"]') as HTMLButtonElement).click();
    const del = http.expectOne((r) => r.method === 'DELETE' && r.url === `${URL}/${recent.id}`);
    del.flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    listRequest().flush([older]);
    await settle(fixture);

    expect(toast).toHaveBeenCalledWith('Sessão encerrada.');
    expect(host.changed).toHaveBeenCalledTimes(1);
    expect(rows(el)).toHaveLength(1);
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('Cancelar não encerra nada', async () => {
    const { fixture, host, el } = await setup();

    button(rows(el)[0], 'revoke-session')!.click();
    await settle(fixture);
    (el.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement).click();
    await settle(fixture);

    http.expectNone((r) => r.method === 'DELETE');
    expect(host.changed).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('Encerrar todas pede confirmação, diz quantas e depois recarrega a lista', async () => {
    const { fixture, host, el } = await setup();

    button(el, 'revoke-all')!.click();
    await settle(fixture);
    expect(text(el.querySelector('[data-testid="action-effect"]'))).toContain('todas as 2 sessões');
    (el.querySelector('[data-testid="confirm-confirm"]') as HTMLButtonElement).click();

    http.expectOne((r) => r.method === 'DELETE' && r.url === URL).flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    listRequest().flush([]);
    await settle(fixture);

    expect(toast).toHaveBeenCalledWith('Todas as sessões foram encerradas.');
    expect(host.changed).toHaveBeenCalledTimes(1);
    expect(rows(el)).toHaveLength(0);
  });

  it('Encerrar todas com uma só sessão diz "a única sessão aberta", sem plural', async () => {
    const { fixture, el } = await setup([recent]);

    button(el, 'revoke-all')!.click();
    await settle(fixture);
    const effect = text(el.querySelector('[data-testid="action-effect"]'));

    expect(effect).toContain('Encerra a única sessão aberta agora');
    expect(effect).not.toContain('todas as 1');
    expect(effect).not.toContain('1 sessões');
  });

  it('falha ao encerrar aparece dentro do diálogo, que continua aberto', async () => {
    const { fixture, host, el } = await setup();

    button(rows(el)[0], 'revoke-session')!.click();
    await settle(fixture);
    (el.querySelector('[data-testid="confirm-confirm"]') as HTMLButtonElement).click();
    http
      .expectOne((r) => r.method === 'DELETE')
      .flush({ code: 'NOT_FOUND', detail: 'Sessão não encontrada.' }, { status: 404, statusText: 'Not Found' });
    await settle(fixture);

    expect(text(el.querySelector('[data-testid="confirm-error"]'))).toBe('Sessão não encontrada.');
    expect(el.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(host.changed).not.toHaveBeenCalled();
  });

  it('recarrega quando o pai pede (refresh) e mostra o erro da lista com "Tentar novamente"', async () => {
    const { fixture, host, el } = await setup();

    host.refresh.set(1);
    await settle(fixture);
    listRequest().flush({ code: 'INTERNAL_ERROR' }, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    expect(el.querySelector('gef-error')).not.toBeNull();
    (el.querySelector('gef-error button') as HTMLButtonElement).click();
    listRequest().flush([recent]);
    await settle(fixture);
    expect(rows(el)).toHaveLength(1);
  });

  it('descarta a resposta antiga quando chega outro pedido (refresh) antes', async () => {
    const { fixture, host, el } = await setup('pending');

    host.refresh.set(1);
    await settle(fixture);
    const [stale, fresh] = http.match((r) => r.method === 'GET' && r.url === URL);
    expect(stale.cancelled).toBe(true);
    fresh.flush([older]);
    await settle(fixture);

    expect(rows(el)).toHaveLength(1);
  });

  it('IP e dispositivo não vão para texto de erro nem de aviso', async () => {
    const { fixture, el } = await setup();

    button(rows(el)[0], 'revoke-session')!.click();
    await settle(fixture);
    (el.querySelector('[data-testid="confirm-confirm"]') as HTMLButtonElement).click();
    http.expectOne((r) => r.method === 'DELETE').flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    listRequest().flush([older]);

    for (const call of toast.mock.calls) {
      expect(String(call[0])).not.toContain('203.0.113.7');
      expect(String(call[0])).not.toContain('Chrome');
    }
  });
});
