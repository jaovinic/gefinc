import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CurrentUser, NAV_ITEMS, NoticeService, SessionService } from '@gefinc/ui-shared';
import { of } from 'rxjs';
import { Shell } from './shell';

@Component({ template: '<p>conteúdo</p>' })
class Page {}

const STORAGE_KEY = 'gefinc.ui.sidebar-collapsed';

describe('Shell (menu lateral)', () => {
  const logout = jest.fn(() => of(undefined));
  const load = jest.fn();
  /** Só o que o atalho Minha conta lê do usuário atual. */
  const currentUser = {
    profile: signal({ id: 1, email: 'ana@example.com', name: 'Ana Souza', createdAt: '2026-01-01T00:00:00Z' }),
    failed: signal(false),
    displayName: signal<string | null>('Ana Souza'),
    initial: signal<string | null>('A'),
    load,
  };

  async function setup() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Page },
          { path: 'transactions', component: Page },
          { path: 'settings', component: Page },
          { path: 'login', component: Page },
        ]),
        { provide: SessionService, useValue: { logout } },
        { provide: CurrentUser, useValue: currentUser },
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, router };
  }

  beforeEach(() => {
    logout.mockClear();
    load.mockClear();
    try {
      localStorage.clear();
    } catch {
      /* sem armazenamento */
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it('mostra o logo e todas as áreas do menu com ícone e nome', async () => {
    const { el } = await setup();
    const side = el.querySelector('aside[data-testid="sidenav"]') as HTMLElement;
    expect(side.querySelector('gef-logo')).not.toBeNull();
    const links = Array.from(side.querySelectorAll('a.gef-nav-link'));
    expect(links.map((l) => l.textContent?.trim())).toEqual(NAV_ITEMS.map((i) => i.label));
    expect(links.every((l) => l.querySelector('svg') !== null)).toBe(true);
  });

  it('o menu lateral tem Transferências, logo depois de Contas e cartões, apontando para /transfers', async () => {
    const { el } = await setup();
    const links = Array.from(el.querySelectorAll('aside[data-testid="sidenav"] a.gef-nav-link')) as HTMLAnchorElement[];
    const labels = links.map((l) => l.textContent?.trim());
    const transfers = links[labels.indexOf('Transferências')];

    expect(labels.indexOf('Transferências')).toBe(labels.indexOf('Contas e cartões') + 1);
    expect(transfers.getAttribute('href')).toBe('/transfers');
  });

  it('a barra do topo traz o atalho Minha conta com nome e inicial, fixo à direita', async () => {
    const { el } = await setup();
    const topbar = el.querySelector('header.gef-topbar') as HTMLElement;
    const chip = topbar.querySelector('gef-account-chip') as HTMLElement;
    const link = chip.querySelector('a[data-testid="account-chip"]') as HTMLAnchorElement;

    expect(link.getAttribute('href')).toBe('/settings');
    expect(link.getAttribute('aria-label')).toBe('Minha conta — Ana Souza');
    expect(link.textContent).toContain('Ana Souza');
    expect(link.querySelector('gef-avatar')?.textContent?.trim()).toBe('A');
    expect(chip.parentElement?.classList.contains('ml-auto')).toBe(true);
    expect(load).toHaveBeenCalled();
  });

  it('a barra do topo traz o alternador de tema (ícone) antes do atalho, e a barra e o menu são de vidro', async () => {
    const { el } = await setup();
    const topbar = el.querySelector('header.gef-topbar') as HTMLElement;
    const toggle = topbar.querySelector('gef-theme-toggle button[data-testid="theme-toggle"]') as HTMLButtonElement;

    expect(toggle.getAttribute('aria-label')).toMatch(/^Tema: .+\. Alternar para /);
    expect(toggle.compareDocumentPosition(topbar.querySelector('gef-account-chip') as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(el.querySelector('aside.gef-sidenav')).not.toBeNull();
  });

  it('no desktop a barra do topo esconde o botão de menu e o logo, mas mantém o atalho', async () => {
    const { el } = await setup();
    const topbar = el.querySelector('header.gef-topbar') as HTMLElement;

    expect(topbar.querySelector('button[aria-label="Abrir menu"]')?.classList.contains('lg:hidden')).toBe(true);
    expect(topbar.querySelector('gef-logo')?.classList.contains('lg:hidden')).toBe(true);
    expect(topbar.querySelector('gef-account-chip')?.classList.contains('lg:hidden')).toBe(false);
  });

  it('o atalho da barra do topo também marca a página atual', async () => {
    const { fixture, el, router } = await setup();
    const chip = () => el.querySelector('header a[data-testid="account-chip"]') as HTMLAnchorElement;
    expect(chip().getAttribute('aria-current')).toBeNull();

    await router.navigateByUrl('/settings');
    fixture.detectChanges();
    expect(chip().getAttribute('aria-current')).toBe('page');
  });

  it('Minha conta e Sair ficam no rodapé do menu', async () => {
    const { el } = await setup();
    const footer = el.querySelector('aside [data-testid="sidenav-footer"]') as HTMLElement;
    expect(footer.textContent).toContain('Minha conta');
    expect(footer.querySelector('button')?.textContent).toContain('Sair');
    expect(el.querySelector('aside nav[aria-label="Principal"]')?.textContent).not.toContain('Minha conta');
  });

  it('a área atual fica marcada com aria-current e destaque que não depende só de cor', async () => {
    const { fixture, el, router } = await setup();
    const link = (label: string) => Array.from(el.querySelectorAll<HTMLAnchorElement>('aside a.gef-nav-link')).find((l) => l.textContent?.includes(label))!;
    expect(link('Painel').getAttribute('aria-current')).toBe('page');
    expect(link('Lançamentos').getAttribute('aria-current')).toBeNull();

    await router.navigateByUrl('/transactions');
    fixture.detectChanges();
    expect(link('Lançamentos').getAttribute('aria-current')).toBe('page');
    expect(link('Painel').getAttribute('aria-current')).toBeNull();
    expect(link('Lançamentos').classList.contains('gef-nav-active')).toBe(true);
  });

  it('recolhe para só ícones, mantém o nome acessível e lembra a escolha', async () => {
    const { fixture, el } = await setup();
    const side = el.querySelector('aside') as HTMLElement;
    expect(side.getAttribute('data-collapsed')).toBeNull();

    (el.querySelector('button[aria-label="Recolher menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(side.getAttribute('data-collapsed')).toBe('true');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
    const link = side.querySelector('a.gef-nav-link') as HTMLAnchorElement;
    expect(link.getAttribute('aria-label')).toBe('Painel');
    expect(link.getAttribute('data-label')).toBe('Painel');
    expect(el.querySelector('button[aria-label="Expandir menu"]')?.getAttribute('aria-expanded')).toBe('false');

    // reabrir o sistema respeita a escolha
    const second = await setup();
    expect(second.el.querySelector('aside')?.getAttribute('data-collapsed')).toBe('true');
  });

  it('expande de novo e esquece a escolha', async () => {
    localStorage.setItem(STORAGE_KEY, '1');
    const { fixture, el } = await setup();
    (el.querySelector('button[aria-label="Expandir menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('aside')?.getAttribute('data-collapsed')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('funciona mesmo se o navegador bloquear o armazenamento', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const { fixture, el } = await setup();
    (el.querySelector('button[aria-label="Recolher menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('aside')?.getAttribute('data-collapsed')).toBe('true');
  });

  it('em tela estreita o botão abre o menu como gaveta, que fecha ao escolher uma área', async () => {
    const { fixture, el } = await setup();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    (el.querySelector('button[aria-label="Abrir menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const drawer = el.querySelector('[role="dialog"]') as HTMLElement;
    expect(drawer.classList.contains('gef-sheet-left')).toBe(true);
    const links = Array.from(drawer.querySelectorAll<HTMLAnchorElement>('a.gef-nav-link'));
    expect(links.map((l) => l.textContent?.trim())).toEqual(NAV_ITEMS.map((i) => i.label));

    links.find((l) => l.textContent?.includes('Lançamentos'))!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('Escape fecha a gaveta', async () => {
    const { fixture, el } = await setup();
    (el.querySelector('button[aria-label="Abrir menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('.gef-sheet-backdrop') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('Sair encerra a sessão e volta para o login', async () => {
    const { fixture, el, router } = await setup();
    const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    (Array.from(el.querySelectorAll('aside button')).find((b) => b.textContent?.includes('Sair')) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('mostra o aviso global acima do conteúdo', async () => {
    const { fixture, el } = await setup();
    TestBed.inject(NoticeService).staleVersion();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('outro dispositivo');
  });
});
