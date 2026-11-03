import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { API_BASE_URL } from '../../api/api.tokens';
import { AccountChip } from './account-chip';

const ME = '/api/v1/auth/me';
const profile = (name: string | null) => ({ id: 1, email: 'ana.souza@example.com', name, createdAt: '2026-01-01T00:00:00Z' });

@Component({ template: '' })
class Page {}

@Component({
  imports: [AccountChip],
  template: `<gef-account-chip [link]="link" /><gef-account-chip [link]="link" />`,
})
class Twice {
  link = '/settings';
}

describe('AccountChip (atalho Minha conta)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: '', component: Page },
          { path: 'settings', component: Page },
        ]),
        { provide: API_BASE_URL, useValue: '/api/v1' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function setup(link = '/settings') {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    const fixture = TestBed.createComponent(AccountChip);
    fixture.componentRef.setInput('link', link);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const chip = () => el.querySelector('a[data-testid="account-chip"]') as HTMLAnchorElement;
    return { fixture, el, chip, router };
  }

  it('mostra a inicial e o nome, com o nome no rótulo acessível', async () => {
    const { fixture, el, chip } = await setup();
    http.expectOne(ME).flush(profile('Ana Souza'));
    fixture.detectChanges();

    expect(chip().getAttribute('aria-label')).toBe('Minha conta — Ana Souza');
    expect(chip().querySelector('.gef-account-chip-name')?.textContent?.trim()).toBe('Ana Souza');
    expect(el.querySelector('gef-avatar span[aria-hidden="true"]')?.textContent?.trim()).toBe('A');
    expect(chip().getAttribute('aria-busy')).toBeNull();
  });

  it('o nome visível está contido no rótulo acessível', async () => {
    const { fixture, chip } = await setup();
    http.expectOne(ME).flush(profile('Ana Souza'));
    fixture.detectChanges();

    const visible = chip().querySelector('.gef-account-chip-name')!.textContent!.trim();
    expect(chip().getAttribute('aria-label')).toContain(visible);
  });

  it('o nome tem a classe de truncamento', async () => {
    const { fixture, chip } = await setup();
    http.expectOne(ME).flush(profile('Ana Souza'));
    fixture.detectChanges();

    expect(chip().querySelector('.gef-account-chip-name')).not.toBeNull();
    expect(chip().classList.contains('gef-account-chip')).toBe(true);
  });

  it('sem nome usa a parte local do e-mail', async () => {
    const { fixture, chip } = await setup();
    http.expectOne(ME).flush(profile(null));
    fixture.detectChanges();

    expect(chip().querySelector('.gef-account-chip-name')?.textContent?.trim()).toBe('ana.souza');
    expect(chip().getAttribute('aria-label')).toBe('Minha conta — ana.souza');
  });

  it('nome com marcação é exibido como texto, nunca interpretado', async () => {
    const { fixture, el, chip } = await setup();
    http.expectOne(ME).flush(profile('<img src=x onerror=alert(1)>'));
    fixture.detectChanges();

    expect(el.querySelector('img')).toBeNull();
    expect(chip().querySelector('.gef-account-chip-name')?.textContent).toContain('<img src=x');
  });

  it('enquanto carrega mostra o esqueleto e o rótulo "Minha conta"', async () => {
    const { fixture, el, chip } = await setup();

    expect(chip().getAttribute('aria-label')).toBe('Minha conta');
    expect(chip().getAttribute('aria-busy')).toBe('true');
    expect(el.querySelectorAll('.gef-skeleton').length).toBe(2);
    expect(el.querySelector('.gef-account-chip-name')).toBeNull();

    http.expectOne(ME).flush(profile('Ana Souza'));
    fixture.detectChanges();
    expect(el.querySelector('.gef-skeleton')).toBeNull();
  });

  it('se falhar mostra "Minha conta" com o ícone, sem alerta', async () => {
    const { fixture, el, chip } = await setup();
    http.expectOne(ME).flush({ code: 'ERRO' }, { status: 0, statusText: 'Unknown Error' });
    fixture.detectChanges();

    expect(chip().getAttribute('aria-label')).toBe('Minha conta');
    expect(chip().querySelector('.gef-account-chip-name')?.textContent?.trim()).toBe('Minha conta');
    expect(chip().querySelector('gef-avatar svg')).not.toBeNull();
    expect(el.querySelector('.gef-skeleton')).toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('aponta para o destino informado', async () => {
    const { chip } = await setup('/minha-conta');
    http.expectOne(ME);

    expect(chip().getAttribute('href')).toBe('/minha-conta');
  });

  it('marca aria-current="page" só quando a rota é a do atalho', async () => {
    const { fixture, chip, router } = await setup();
    http.expectOne(ME).flush(profile('Ana Souza'));
    expect(chip().getAttribute('aria-current')).toBeNull();

    await router.navigateByUrl('/settings');
    fixture.detectChanges();
    expect(chip().getAttribute('aria-current')).toBe('page');
    expect(chip().classList.contains('gef-account-chip-active')).toBe(true);
  });

  it('duas instâncias não duplicam a chamada à API', async () => {
    const fixture = TestBed.createComponent(Twice);
    fixture.detectChanges();
    http.expectOne(ME).flush(profile('Ana Souza'));
    fixture.detectChanges();

    const labels = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map((a) => a.getAttribute('aria-label'));
    expect(labels).toEqual(['Minha conta — Ana Souza', 'Minha conta — Ana Souza']);
  });

  describe('modo ação (abre um menu em vez de navegar)', () => {
    async function setupAction(expanded = false, active = false) {
      const fixture = TestBed.createComponent(AccountChip);
      fixture.componentRef.setInput('mode', 'action');
      fixture.componentRef.setInput('expanded', expanded);
      fixture.componentRef.setInput('active', active);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const button = () => el.querySelector('button[data-testid="account-chip"]') as HTMLButtonElement;
      return { fixture, el, button };
    }

    it('é um botão com aria-haspopup="dialog", sem link, e avisa ao ser acionado', async () => {
      const { fixture, el, button } = await setupAction();
      http.expectOne(ME).flush(profile('Ana Souza'));
      fixture.detectChanges();
      const spy = jest.fn();
      fixture.componentInstance.activated.subscribe(spy);

      expect(el.querySelector('a')).toBeNull();
      expect(button().type).toBe('button');
      expect(button().getAttribute('aria-haspopup')).toBe('dialog');
      expect(button().getAttribute('aria-expanded')).toBe('false');
      expect(button().getAttribute('aria-label')).toBe('Mais opções — Ana Souza');
      expect(button().textContent).toContain('Ana Souza');

      button().click();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('aria-expanded e o destaque acompanham o menu aberto ou a página atual', async () => {
      const { fixture, button } = await setupAction(true);
      http.expectOne(ME).flush(profile('Ana Souza'));
      fixture.detectChanges();
      expect(button().getAttribute('aria-expanded')).toBe('true');
      expect(button().classList.contains('gef-account-chip-active')).toBe(true);

      fixture.componentRef.setInput('expanded', false);
      fixture.detectChanges();
      expect(button().classList.contains('gef-account-chip-active')).toBe(false);

      fixture.componentRef.setInput('active', true);
      fixture.detectChanges();
      expect(button().classList.contains('gef-account-chip-active')).toBe(true);
    });

    it('carregando mostra o esqueleto e o rótulo genérico; se falhar, o rótulo contém o texto visível', async () => {
      const { fixture, el, button } = await setupAction();
      expect(button().getAttribute('aria-label')).toBe('Mais opções');
      expect(button().getAttribute('aria-busy')).toBe('true');
      expect(el.querySelectorAll('.gef-skeleton').length).toBe(2);

      http.expectOne(ME).flush({ code: 'ERRO' }, { status: 0, statusText: 'Unknown Error' });
      fixture.detectChanges();
      expect(button().getAttribute('aria-label')).toBe('Mais opções — Minha conta');
      expect(button().textContent).toContain('Minha conta');
    });
  });
});
