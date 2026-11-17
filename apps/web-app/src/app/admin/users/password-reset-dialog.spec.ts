import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PasswordResetDialog, type PasswordResetMode } from './password-reset-dialog';

@Component({
  imports: [PasswordResetDialog],
  template: `
    <gef-password-reset-dialog
      [open]="open()"
      [mode]="mode()"
      [busy]="busy()"
      [error]="error()"
      (confirmed)="confirmed($event)"
      (cancelled)="cancelled()"
    />
  `,
})
class Host {
  readonly open = signal(true);
  readonly mode = signal<PasswordResetMode>('send');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmed = jest.fn<void, [{ password?: string }]>();
  readonly cancelled = jest.fn();
}

describe('PasswordResetDialog', () => {
  async function setup(configure?: (host: Host) => void) {
    const fixture = TestBed.createComponent(Host);
    configure?.(fixture.componentInstance);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  const dialog = (el: HTMLElement) => el.querySelector('[role="alertdialog"]') as HTMLElement | null;
  const confirmBtn = (el: HTMLElement) => el.querySelector('[data-testid="confirm-confirm"]') as HTMLButtonElement;
  const passwordInput = (el: HTMLElement) => el.querySelector('[data-testid="action-password"]') as HTMLInputElement | null;
  const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('modo send: mostra o efeito da ação, não pede senha e confirma direto', async () => {
    const { host, el } = await setup((h) => h.mode.set('send'));

    expect(dialog(el)).not.toBeNull();
    expect(text(el.querySelector('[data-testid="action-effect"]'))).toContain('novo link de redefinição de senha');
    expect(text(el.querySelector('[data-testid="action-effect"]'))).toContain('continuam valendo');
    expect(passwordInput(el)).toBeNull();
    expect(text(confirmBtn(el))).toBe('Reenviar e-mail de redefinição');
    expect(confirmBtn(el).classList.contains('gef-btn-primary')).toBe(true);

    confirmBtn(el).click();
    expect(host.confirmed).toHaveBeenCalledWith({});
  });

  it('modo force: mostra o efeito destrutivo, exige a senha do administrador e emite a senha', async () => {
    const { fixture, host, el } = await setup((h) => h.mode.set('force'));

    expect(text(el.querySelector('[data-testid="action-effect"]'))).toContain('deixam de valer imediatamente');
    expect(confirmBtn(el).classList.contains('gef-btn-danger')).toBe(true);
    expect(passwordInput(el)).not.toBeNull();

    // Sem senha não confirma
    confirmBtn(el).click();
    fixture.detectChanges();
    expect(host.confirmed).not.toHaveBeenCalled();
    expect(text(el.querySelector('[data-testid="password-error"]'))).toContain('Informe sua senha');

    // Com senha emite
    const input = passwordInput(el)!;
    input.value = 'minha-senha-admin';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    confirmBtn(el).click();

    expect(host.confirmed).toHaveBeenCalledWith({ password: 'minha-senha-admin' });
  });

  it('exibe a mensagem de falha de envio de e-mail dentro do diálogo sem fechá-lo e limpa a senha', async () => {
    const { fixture, host, el } = await setup((h) => h.mode.set('force'));
    const input = passwordInput(el)!;
    input.value = 'minha-senha-admin';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    confirmBtn(el).click();

    host.error.set('Não foi possível enviar o e-mail de redefinição. Nada foi alterado; tente novamente.');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dialog(el)).not.toBeNull();
    expect(text(el.querySelector('[data-testid="confirm-error"]'))).toBe(
      'Não foi possível enviar o e-mail de redefinição. Nada foi alterado; tente novamente.',
    );
    expect(input.value).toBe('');
    expect(host.cancelled).not.toHaveBeenCalled();
  });
});
