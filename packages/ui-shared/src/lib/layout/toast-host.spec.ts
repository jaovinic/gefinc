import { TestBed } from '@angular/core/testing';
import { NoticeService } from '../api/notice.service';
import { ToastHost } from './toast-host';

describe('gef-toast-host', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function render() {
    const fixture = TestBed.createComponent(ToastHost);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, notices: TestBed.inject(NoticeService) };
  }

  it('mostra as confirmações em uma região anunciada de forma discreta', () => {
    const { fixture, el, notices } = render();
    notices.toast('Pagamento registrado.');
    fixture.detectChanges();
    const region = el.querySelector('[data-testid="toast-region"]') as HTMLElement;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toContain('Pagamento registrado.');
    expect(region.querySelector('svg')).not.toBeNull();
  });

  it('o botão Desfazer executa a ação e some', () => {
    const { fixture, el, notices } = render();
    const undo = jest.fn();
    notices.toast('Despesa paga.', { undo });
    fixture.detectChanges();
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Desfazer') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(undo).toHaveBeenCalled();
    expect(el.textContent).not.toContain('Despesa paga.');
  });

  it('o botão Fechar dispensa o aviso e ele some sozinho se ninguém mexer', () => {
    const { fixture, el, notices } = render();
    notices.toast('Salvo.');
    fixture.detectChanges();
    (el.querySelector('button[aria-label="Fechar aviso"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Salvo.');

    notices.toast('Outro.');
    fixture.detectChanges();
    jest.advanceTimersByTime(6000);
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Outro.');
  });
});
