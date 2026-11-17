import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PendingEmailChange } from '@gefinc/core-models';
import { EmailChangeDialog } from './email-change-dialog';

@Component({
  imports: [EmailChangeDialog],
  template: `
    <gef-email-change-dialog
      [open]="open()"
      [pending]="pending()"
      [busy]="busy()"
      [error]="error()"
      (requestSubmitted)="onRequest($event)"
      (confirmSubmitted)="onConfirm($event)"
      (cancelPending)="onCancelPending()"
      (cancelled)="onCancelled()"
    />
  `,
})
class Host {
  readonly open = signal(true);
  readonly pending = signal<PendingEmailChange | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly onRequest = jest.fn();
  readonly onConfirm = jest.fn();
  readonly onCancelPending = jest.fn();
  readonly onCancelled = jest.fn();
}

describe('EmailChangeDialog', () => {
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
  const emailInput = (el: HTMLElement) => el.querySelector('[data-testid="email-input"]') as HTMLInputElement | null;
  const codeInput = (el: HTMLElement) => el.querySelector('[data-testid="code-input"]') as HTMLInputElement | null;
  const cancelPendingBtn = (el: HTMLElement) => el.querySelector('[data-testid="cancel-pending-btn"]') as HTMLButtonElement | null;
  const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('passo 1 (sem pendência): exibe campo de novo e-mail e validação', async () => {
    const { fixture, host, el } = await setup((h) => h.pending.set(null));

    expect(dialog(el)).not.toBeNull();
    expect(text(el.querySelector('[data-testid="dialog-effect"]'))).toContain('código numérico de 6 dígitos');
    expect(emailInput(el)).not.toBeNull();
    expect(codeInput(el)).toBeNull();

    // Validação de e-mail inválido
    confirmBtn(el).click();
    fixture.detectChanges();
    expect(host.onRequest).not.toHaveBeenCalled();
    expect(text(el.querySelector('[data-testid="email-error"]'))).toContain('Informe um endereço de e-mail válido');

    // Preenche e-mail válido
    emailInput(el)!.value = 'novo@dominio.com';
    emailInput(el)!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    confirmBtn(el).click();
    expect(host.onRequest).toHaveBeenCalledWith('novo@dominio.com');
  });

  it('passo 2 (com pendência ativa): exibe informações, campo de código de 6 dígitos e cancelamento', async () => {
    const pendingData: PendingEmailChange = {
      newEmail: 'novo@dominio.com',
      expiresAt: '2026-11-17T12:00:00Z',
      attemptsLeft: 4,
    };
    const { fixture, host, el } = await setup((h) => h.pending.set(pendingData));

    expect(text(el.querySelector('[data-testid="pending-info"]'))).toContain('novo@dominio.com');
    expect(text(el.querySelector('[data-testid="pending-info"]'))).toContain('4 de 5');
    expect(emailInput(el)).toBeNull();
    expect(codeInput(el)).not.toBeNull();
    expect(cancelPendingBtn(el)).not.toBeNull();

    // Validação de código incompleto
    codeInput(el)!.value = '123';
    codeInput(el)!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    confirmBtn(el).click();
    fixture.detectChanges();
    expect(host.onConfirm).not.toHaveBeenCalled();
    expect(text(el.querySelector('[data-testid="code-error"]'))).toContain('6 dígitos numéricos');

    // Preenche 6 dígitos
    codeInput(el)!.value = '123456';
    codeInput(el)!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    confirmBtn(el).click();
    expect(host.onConfirm).toHaveBeenCalledWith('123456');

    // Cancelar pendência
    cancelPendingBtn(el)!.click();
    expect(host.onCancelPending).toHaveBeenCalled();
  });
});
