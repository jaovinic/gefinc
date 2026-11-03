import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CurrentUser } from '@gefinc/ui-shared';
import { LogoutAction } from '../core/logout';
import { NetworkStatus } from '../offline/network-status';
import { PendingQueue } from '../offline/pending-queue';
import { SyncEngine } from '../offline/sync-engine';
import { MobileShell } from './mobile-shell';
import { appRoutes } from '../app.routes';

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
              { path: 'fluxo-de-caixa', component: Dummy },
              { path: 'categorias', component: Dummy },
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

  it('mostra a ilha de navegação só com Painel, Lançamentos, Faturas e Contas', async () => {
    const { el } = await open('/');
    const nav = el.querySelector('nav.gef-tabbar') as HTMLElement;
    const tabs = [...nav.querySelectorAll('a')].map((a) => [a.textContent?.trim(), a.getAttribute('href')]);

    expect(nav.getAttribute('aria-label')).toBe('Navegação principal');
    expect(tabs).toEqual([
      ['Painel', '/'],
      ['Lançamentos', '/lancamentos'],
      ['Faturas', '/faturas'],
      ['Contas', '/contas'],
    ]);
  });

  it('a aba da página atual tem aria-current="page"', async () => {
    const { el } = await open('/faturas');
    const current = [...el.querySelectorAll('nav.gef-tabbar a[aria-current="page"]')].map((a) => a.textContent?.trim());
    expect(current).toEqual(['Faturas']);
  });

  it('o endereço antigo /mais redireciona ao painel', () => {
    const shell = appRoutes.find((r) => r.children);
    const mais = shell?.children?.find((r) => r.path === 'mais');
    expect(mais?.redirectTo).toBe('');
  });

  it('marca a aba ativa e atualiza ao navegar', async () => {
    const { harness, el } = await open('/');
    const active = () => [...el.querySelectorAll('nav a.gef-tab-active')].map((a) => a.textContent?.trim());
    expect(active()).toEqual(['Painel']);

    await harness.navigateByUrl('/faturas');
    expect(active()).toEqual(['Faturas']);
  });

  describe('indicador de vidro da ilha', () => {
    const nav = (el: HTMLElement) => el.querySelector('nav.gef-tabbar') as HTMLElement;
    const index = (el: HTMLElement) => nav(el).style.getPropertyValue('--i');

    it('é o primeiro filho da ilha, decorativo, e a ilha continua com exatamente 4 abas', async () => {
      const { el } = await open('/');
      const glass = nav(el).firstElementChild as HTMLElement;

      expect(glass.classList).toContain('gef-tab-glass');
      expect(glass.getAttribute('aria-hidden')).toBe('true');
      expect(nav(el).querySelectorAll('a')).toHaveLength(4);
      expect(nav(el).querySelectorAll('.gef-tab-label')).toHaveLength(4);
    });

    it('acompanha a rota: Painel 0, Lançamentos 1, Faturas 2, Contas 3', async () => {
      const { harness, el } = await open('/');
      expect(index(el)).toBe('0');

      for (const [url, expected] of [['/lancamentos', '1'], ['/faturas', '2'], ['/contas', '3'], ['/', '0']]) {
        await harness.navigateByUrl(url);
        harness.detectChanges();
        expect(index(el)).toBe(expected);
        expect(nav(el).hasAttribute('data-none')).toBe(false);
      }
    });

    it('em rotas fora das abas o indicador some (data-none) e fica onde estava', async () => {
      const { harness, el } = await open('/contas');
      await harness.navigateByUrl('/categorias');
      harness.detectChanges();

      expect(nav(el).hasAttribute('data-none')).toBe(true);
      expect(index(el)).toBe('3');
      expect(el.querySelectorAll('nav a[aria-current="page"]')).toHaveLength(0);

      await harness.navigateByUrl('/faturas');
      harness.detectChanges();
      expect(nav(el).hasAttribute('data-none')).toBe(false);
      expect(index(el)).toBe('2');
    });

    it('a transição só liga depois da primeira posição (data-ready)', async () => {
      const { harness, el } = await open('/lancamentos');
      expect(nav(el).hasAttribute('data-ready')).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 50));
      harness.detectChanges();
      expect(nav(el).hasAttribute('data-ready')).toBe(true);
    });

    it('publica a escala de texto do sistema (raiz / 16px) em --text-scale para a ilha limitar o crescimento dos rótulos', async () => {
      document.documentElement.style.fontSize = '20.8px';
      try {
        await open('/');
        expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.3');
      } finally {
        document.documentElement.style.fontSize = '';
        document.documentElement.style.removeProperty('--text-scale');
      }
    });

    it('com ajuste de fonte muito grande (2.0) a ilha marca data-large-text; em 1.3 não', async () => {
      try {
        document.documentElement.style.fontSize = '32px';
        const big = await open('/');
        expect(big.el.querySelector('nav.gef-tabbar')?.hasAttribute('data-large-text')).toBe(true);
        expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('2');
      } finally {
        document.documentElement.style.fontSize = '';
        document.documentElement.style.removeProperty('--text-scale');
      }
      TestBed.resetTestingModule();
      try {
        document.documentElement.style.fontSize = '20.8px';
        const medium = await open('/');
        expect(medium.el.querySelector('nav.gef-tabbar')?.hasAttribute('data-large-text')).toBe(false);
      } finally {
        document.documentElement.style.fontSize = '';
        document.documentElement.style.removeProperty('--text-scale');
      }
    });

    it('o rótulo da aba tem classe própria para elipse e o ativo não muda de peso', async () => {
      const { el } = await open('/lancamentos');
      const label = el.querySelector('nav a .gef-tab-label') as HTMLElement;
      expect(label).not.toBeNull();
      expect(el.querySelector('nav a.gef-tab-active')?.className).not.toContain('font-bold');
    });
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

  const chipOf = (el: HTMLElement) => el.querySelector('header [data-testid="account-chip"]') as HTMLButtonElement;
  const more = (el: HTMLElement) => el.querySelector('[role="dialog"][aria-label="Mais"]') as HTMLElement | null;

  it('o cabeçalho traz o atalho Minha conta (botão que abre o menu) com nome e inicial, à direita da marca', async () => {
    const { el } = await open('/');
    const header = el.querySelector('header.gef-app-header') as HTMLElement;
    const chip = chipOf(el);

    expect(header.querySelector('gef-logo')).not.toBeNull();
    expect(chip.tagName).toBe('BUTTON');
    expect(chip.getAttribute('aria-haspopup')).toBe('dialog');
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(chip.getAttribute('aria-label')).toBe('Mais opções — Ana Souza');
    expect(chip.textContent).toContain('Ana Souza');
    expect(chip.querySelector('gef-avatar')?.textContent?.trim()).toBe('A');
    expect(header.querySelector('gef-account-chip')?.classList.contains('ml-auto')).toBe(true);
    expect(load).toHaveBeenCalled();
  });

  it('tocar no atalho abre o menu Mais e fechar devolve o foco ao atalho', async () => {
    const { harness, el } = await open('/');
    expect(more(el)).toBeNull();

    chipOf(el).focus();
    chipOf(el).click();
    harness.detectChanges();
    expect(more(el)).not.toBeNull();
    expect(chipOf(el).getAttribute('aria-expanded')).toBe('true');
    expect(chipOf(el).classList.contains('gef-account-chip-active')).toBe(true);

    (more(el)!.querySelector('button[aria-label="Fechar"]') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(more(el)).toBeNull();
    expect(chipOf(el).getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(chipOf(el));
  });

  it('o atalho fica destacado na página Minha conta, mesmo com o menu fechado', async () => {
    const { harness, el } = await open('/');
    expect(chipOf(el).classList.contains('gef-account-chip-active')).toBe(false);

    await harness.navigateByUrl('/minha-conta');
    harness.detectChanges();
    expect(chipOf(el).classList.contains('gef-account-chip-active')).toBe(true);
    expect(chipOf(el).getAttribute('aria-expanded')).toBe('false');
  });

  it('o menu Mais dá acesso a Fluxo de caixa, Categorias, Minha conta, Aparência e Sair', async () => {
    const { harness, el } = await open('/');
    chipOf(el).click();
    harness.detectChanges();
    const menu = more(el)!;

    const links = [...menu.querySelectorAll('a')].map((a) => [a.textContent?.trim(), a.getAttribute('href')]);
    expect(links).toEqual([
      ['Fluxo de caixa', '/fluxo-de-caixa'],
      ['Categorias', '/categorias'],
      ['Minha conta', '/minha-conta'],
    ]);
    expect(menu.querySelector('[role="radiogroup"][aria-label="Aparência"]')).not.toBeNull();

    const leave = [...menu.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Sair') as HTMLButtonElement;
    leave.click();
    harness.detectChanges();
    expect(logout.run).toHaveBeenCalledTimes(1);
    expect(more(el)).toBeNull();
  });

  it('escolher um destino do menu navega e fecha o painel', async () => {
    const { harness, el } = await open('/');
    chipOf(el).click();
    harness.detectChanges();

    (more(el)!.querySelector('a[href="/categorias"]') as HTMLAnchorElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/categorias');
    expect(more(el)).toBeNull();
  });

  it('a ilha não tem mais a aba Mais', async () => {
    const { el } = await open('/');
    expect(el.querySelector('nav.gef-tabbar a[href="/mais"]')).toBeNull();
    expect(el.querySelectorAll('nav.gef-tabbar a').length).toBe(4);
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
