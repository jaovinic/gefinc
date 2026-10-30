import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CurrentUser } from '@gefinc/ui-shared';
import { LogoutAction } from '../core/logout';
import { NetworkStatus } from '../offline/network-status';
import { PendingQueue } from '../offline/pending-queue';
import { SyncEngine } from '../offline/sync-engine';
import { MobileShell } from './mobile-shell';
import { MorePage } from './more.page';

@Component({ template: '<p>conteúdo</p>' })
class Dummy {}

describe('shell do app móvel', () => {
  const confirming = signal(false);
  const logout = { run: jest.fn(), confirming, pending: signal(2), cancel: jest.fn(), confirmDiscard: jest.fn() };

  const load = jest.fn();
  /** Só o que o atalho Minha conta lê do usuário atual. */
  const currentUser = {
    profile: signal({ id: 1, email: 'ana@example.com', name: 'Ana Souza', createdAt: '2026-01-01T00:00:00Z' }),
    failed: signal(false),
    displayName: signal<string | null>('Ana Souza'),
    initial: signal<string | null>('A'),
    load,
  };

  async function open(url: string) {
    TestBed.configureTestingModule({
      providers: [
        { provide: LogoutAction, useValue: logout },
        { provide: CurrentUser, useValue: currentUser },
        { provide: NetworkStatus, useValue: { online: signal(true) } },
        { provide: PendingQueue, useValue: { pendingCount: signal(0), rejected: signal([]) } },
        { provide: SyncEngine, useValue: { flush: jest.fn(), syncing: signal(false) } },
        provideRouter([
          {
            path: '',
            component: MobileShell,
            children: [
              { path: '', component: Dummy },
              { path: 'lancamentos', component: Dummy },
              { path: 'faturas', component: Dummy },
              { path: 'contas', component: Dummy },
              { path: 'mais', component: MorePage },
              { path: 'minha-conta', component: Dummy },
            ],
          },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create(url);
    return { harness, el: harness.routeNativeElement as HTMLElement };
  }

  beforeEach(() => {
    logout.run.mockReset();
    logout.cancel.mockReset();
    logout.confirmDiscard.mockReset();
    confirming.set(false);
  });

  it('mostra a barra de abas com Painel, Lançamentos, Faturas, Contas e Mais', async () => {
    const { el } = await open('/');
    const nav = el.querySelector('nav.gef-tabbar') as HTMLElement;
    const tabs = [...nav.querySelectorAll('a')].map((a) => [a.textContent?.trim(), a.getAttribute('href')]);

    expect(nav.getAttribute('aria-label')).toBe('Navegação principal');
    expect(tabs).toEqual([
      ['Painel', '/'],
      ['Lançamentos', '/lancamentos'],
      ['Faturas', '/faturas'],
      ['Contas', '/contas'],
      ['Mais', '/mais'],
    ]);
  });

  it('marca a aba ativa e atualiza ao navegar', async () => {
    const { harness, el } = await open('/');
    const active = () => [...el.querySelectorAll('nav a.gef-tab-active')].map((a) => a.textContent?.trim());
    expect(active()).toEqual(['Painel']);

    await harness.navigateByUrl('/faturas');
    expect(active()).toEqual(['Faturas']);
  });

  it('o conteúdo das telas tem margem lateral (não cola nas bordas) e espaço para o botão flutuante', async () => {
    const { el } = await open('/');

    expect((el.querySelector('main') as HTMLElement).classList).toContain('gef-page');
  });

  it('tem cabeçalho com a marca respeitando a área segura superior', async () => {
    const { el } = await open('/');
    const header = el.querySelector('header.gef-app-header') as HTMLElement;
    expect(header.textContent).toContain('GEFINC');
  });

  it('o cabeçalho traz o atalho Minha conta com nome e inicial, à direita da marca', async () => {
    const { el } = await open('/');
    const header = el.querySelector('header.gef-app-header') as HTMLElement;
    const link = header.querySelector('a[data-testid="account-chip"]') as HTMLAnchorElement;

    expect(header.querySelector('gef-logo')).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/minha-conta');
    expect(link.getAttribute('aria-label')).toBe('Minha conta — Ana Souza');
    expect(link.textContent).toContain('Ana Souza');
    expect(link.querySelector('gef-avatar')?.textContent?.trim()).toBe('A');
    expect(header.querySelector('gef-account-chip')?.classList.contains('ml-auto')).toBe(true);
    expect(load).toHaveBeenCalled();
  });

  it('o atalho marca a página atual em Minha conta', async () => {
    const { harness, el } = await open('/');
    const link = () => el.querySelector('header a[data-testid="account-chip"]') as HTMLAnchorElement;
    expect(link().getAttribute('aria-current')).toBeNull();

    await harness.navigateByUrl('/minha-conta');
    expect(link().getAttribute('aria-current')).toBe('page');
  });

  it('o menu Mais dá acesso a Fluxo de caixa, Categorias e Minha conta e permite sair', async () => {
    const { el } = await open('/mais');
    const links = [...el.querySelectorAll('main a')].map((a) => [a.textContent?.trim(), a.getAttribute('href')]);
    expect(links).toEqual([
      ['Fluxo de caixa', '/fluxo-de-caixa'],
      ['Categorias', '/categorias'],
      ['Minha conta', '/minha-conta'],
    ]);

    (el.querySelector('main button') as HTMLButtonElement).click();
    expect(logout.run).toHaveBeenCalledTimes(1);
  });

  it('com operações não enviadas, sair pede confirmação e só descarta se o usuário aceitar', async () => {
    const { harness, el } = await open('/');
    expect(el.querySelector('[role="dialog"]')).toBeNull();

    confirming.set(true);
    harness.detectChanges();
    const dialog = el.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-label')).toBe('Operações não enviadas');
    expect(dialog.textContent).toContain('2 operações');
    expect(dialog.textContent).toContain('serão descartadas');

    (Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Voltar') as HTMLButtonElement).click();
    expect(logout.cancel).toHaveBeenCalled();
    (Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Sair e descartar') as HTMLButtonElement).click();
    expect(logout.confirmDiscard).toHaveBeenCalled();
  });
});
