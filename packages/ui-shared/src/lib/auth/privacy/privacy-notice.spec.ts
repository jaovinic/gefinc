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

  it('nunca guarda o texto bruto do navegador e diz isso', async () => {
    const { el } = await setup();

    expect(text(el)).toContain('não guardamos o texto completo');
  });

  it('tem um título de página e seções com títulos', async () => {
    const { el } = await setup();

    expect(el.querySelector('h1')?.textContent).toContain('Privacidade');
    expect(el.querySelectorAll('h2').length).toBeGreaterThanOrEqual(4);
  });

  it('leva de volta para o login', async () => {
    const { el } = await setup();

    expect(el.querySelector('a[href="/login"]')).not.toBeNull();
  });
});
