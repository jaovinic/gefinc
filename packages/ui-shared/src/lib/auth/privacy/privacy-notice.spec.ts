import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PrivacyNoticePage } from './privacy-notice';

describe('PrivacyNoticePage', () => {
  async function setup() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PrivacyNoticePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement };
  }
  const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('informa que IP e tipo de dispositivo e navegador das sessões são guardados', async () => {
    const { el } = await setup();
    const content = text(el);

    expect(content).toContain('endereço IP');
    expect(content).toContain('tipo de dispositivo e de navegador');
    expect(content).toContain('sessão');
  });

  it('diz para que servem, por quanto tempo ficam (90 dias para visitantes) e como são apagados', async () => {
    const { el } = await setup();
    const content = text(el);

    expect(content).toContain('segurança');
    expect(content).toContain('90 dias');
    expect(content).toContain('visitantes');
    expect(content).toContain('exclui a conta');
    expect(content).toContain('apagados');
  });

  it('diz o prazo exato das sessões encerradas (30 dias) e o que vale para quem tem conta', async () => {
    const { el } = await setup();
    const content = text(el);

    expect(content).toContain('por mais 30 dias depois de encerrada ou expirada');
    expect(content).not.toContain('alguns dias');
    expect(content).toContain('enquanto a conta existir');
    expect(content).toContain('apagado junto com a conta');
    expect(content).toContain('só atinge visitantes');
  });

  it('nunca guarda o texto bruto do navegador e diz isso', async () => {
    const { el } = await setup();

    expect(text(el)).toContain('não guardamos o texto completo');
  });

  it('tem um título de página e seções com títulos', async () => {
    const { el } = await setup();

    expect(el.querySelector('h1')?.textContent).toContain('Privacidade');
    expect(el.querySelectorAll('h2').length).toBeGreaterThanOrEqual(4);
  });

  it('os títulos das seções usam o tamanho de título médio (18 px), acima do corpo', async () => {
    const { el } = await setup();

    for (const h2 of Array.from(el.querySelectorAll('h2'))) {
      expect(h2.className).toContain('text-title-md');
      expect(h2.className).not.toContain('text-title-sm');
    }
  });

  it('leva de volta para o login pelo botão do fim', async () => {
    const { el } = await setup();
    const button = el.querySelector('a.gef-btn-secondary');

    expect(button?.getAttribute('href')).toBe('/login');
    expect(button?.textContent?.trim()).toBe('Voltar para o login');
  });

  it('tem um link Voltar no topo do cartão, para o login e com nome distinto do botão do fim', async () => {
    const { el } = await setup();
    const top = el.querySelector('section > a[href="/login"]') as HTMLElement;

    expect(top).not.toBeNull();
    expect(top.textContent?.trim()).toBe('Voltar');
    expect(top.className).toContain('min-h-11');
    expect(top.compareDocumentPosition(el.querySelector('h1') as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(Array.from(el.querySelectorAll('a[href="/login"]')).filter((a) => /Voltar para o login/.test(a.textContent ?? ''))).toHaveLength(1);
  });

  it('reserva espaço acima do cartão para o botão de tema em telas estreitas', async () => {
    const { el } = await setup();

    expect(el.querySelector('gef-auth-card > div')?.className).toContain('pt-[calc(env(safe-area-inset-top)+4.5rem)]');
  });
});
