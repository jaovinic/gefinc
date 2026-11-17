import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActionDialog, type ActionDialogResult } from './action-dialog';

@Component({
  imports: [ActionDialog],
  template: `
    <gef-action-dialog
      heading="Suspender conta"
      effect="A conta perde o acesso agora e todas as sessões são encerradas."
      confirmLabel="Suspender conta"
      confirmIcon="alert"
      [open]="open()"
      [requireReason]="requireReason()"
      [requirePassword]="requirePassword()"
      [tone]="tone()"
      [busy]="busy()"
      [error]="error()"
      (confirmed)="confirmed($event)"
      (cancelled)="cancelled()"
    />
  `,
})
class Host {
  readonly open = signal(true);
  readonly requireReason = signal(false);
  readonly requirePassword = signal(false);
  readonly tone = signal<'danger' | 'primary'>('danger');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmed = jest.fn<void, [ActionDialogResult]>();
  readonly cancelled = jest.fn();
}

describe('ActionDialog', () => {
  async function setup(configure?: (host: Host) => void) {
    const fixture = TestBed.createComponent(Host);
    configure?.(fixture.componentInstance);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }
  const dialog = (el: HTMLElement) => el.querySelector('[role="alertdialog"]') as HTMLElement | null;
  const confirm = (el: HTMLElement) => el.querySelector('[data-testid="confirm-confirm"]') as HTMLButtonElement;
  const cancel = (el: HTMLElement) => el.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement;
  const reason = (el: HTMLElement) => el.querySelector('[data-testid="action-reason"]') as HTMLTextAreaElement;
  const password = (el: HTMLElement) => el.querySelector('[data-testid="action-password"]') as HTMLInputElement;
  const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  async function typeInto(fixture: { detectChanges(): void }, input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('mostra o efeito da ação em texto antes de confirmar, sempre visível', async () => {
    const { el } = await setup();

    expect(text(el.querySelector('[data-testid="action-effect"]'))).toBe('A conta perde o acesso agora e todas as sessões são encerradas.');
    expect(dialog(el)?.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('abre como diálogo de alerta com o foco em Cancelar', async () => {
    const { el } = await setup();

    expect(dialog(el)).not.toBeNull();
    expect(dialog(el)?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(cancel(el));
  });

  it('o botão destrutivo tem texto e ícone', async () => {
    const { el } = await setup();

    expect(text(confirm(el))).toBe('Suspender conta');
    expect(confirm(el).querySelector('gef-icon')).not.toBeNull();
    expect(confirm(el).classList.contains('gef-btn-danger')).toBe(true);
  });

  it('tom primário usa o botão principal', async () => {
    const { el } = await setup((h) => h.tone.set('primary'));

    expect(confirm(el).classList.contains('gef-btn-primary')).toBe(true);
  });

  it('Escape, Cancelar e o fundo fecham, sem confirmar', async () => {
    const { host, el } = await setup();

    dialog(el)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    cancel(el).click();
    (el.querySelector('.gef-sheet-backdrop') as HTMLElement).click();

    expect(host.cancelled).toHaveBeenCalledTimes(3);
    expect(host.confirmed).not.toHaveBeenCalled();
  });

  it('sem exigências, confirmar emite um resultado vazio', async () => {
    const { host, el } = await setup();

    confirm(el).click();

    expect(host.confirmed).toHaveBeenCalledWith({});
    expect(el.querySelector('[data-testid="action-reason"]')).toBeNull();
    expect(el.querySelector('[data-testid="action-password"]')).toBeNull();
  });

  describe('motivo', () => {
    it('é obrigatório: sem ele mostra o erro do campo e não emite', async () => {
      const { fixture, host, el } = await setup((h) => h.requireReason.set(true));

      confirm(el).click();
      fixture.detectChanges();

      expect(host.confirmed).not.toHaveBeenCalled();
      expect(text(el.querySelector('[data-testid="reason-error"]'))).toContain('Informe o motivo');
      expect(reason(el).getAttribute('aria-invalid')).toBe('true');
      expect(reason(el).getAttribute('aria-describedby')).toContain('reason-error');
    });

    it('só espaços também não vale', async () => {
      const { fixture, host, el } = await setup((h) => h.requireReason.set(true));
      await typeInto(fixture, reason(el), '    ');

      confirm(el).click();

      expect(host.confirmed).not.toHaveBeenCalled();
    });

    it('emite o motivo aparado e tem rótulo e contador de 500', async () => {
      const { fixture, host, el } = await setup((h) => h.requireReason.set(true));
      expect(el.querySelector(`label[for="${reason(el).id}"]`)?.textContent).toContain('Motivo');
      expect(text(el.querySelector('[data-testid="reason-counter"]'))).toBe('0/500');

      await typeInto(fixture, reason(el), '  Uso indevido  ');
      expect(text(el.querySelector('[data-testid="reason-counter"]'))).toBe('16/500');
      confirm(el).click();

      expect(host.confirmed).toHaveBeenCalledWith({ reason: 'Uso indevido' });
    });

    it('limita o campo a 500 caracteres', async () => {
      const { el } = await setup((h) => h.requireReason.set(true));

      expect(reason(el).getAttribute('maxlength')).toBe('500');
    });
  });

  describe('senha', () => {
    it('é obrigatória e o campo é de senha, sem preenchimento automático de outra', async () => {
      const { fixture, host, el } = await setup((h) => h.requirePassword.set(true));

      expect(password(el).type).toBe('password');
      expect(password(el).getAttribute('autocomplete')).toBe('current-password');
      confirm(el).click();
      fixture.detectChanges();

      expect(host.confirmed).not.toHaveBeenCalled();
      expect(text(el.querySelector('[data-testid="password-error"]'))).toContain('Informe sua senha');
    });

    it('emite a senha digitada', async () => {
      const { fixture, host, el } = await setup((h) => {
        h.requirePassword.set(true);
        h.requireReason.set(true);
      });
      await typeInto(fixture, reason(el), 'Motivo');
      await typeInto(fixture, password(el), 'senha-forte-123');

      confirm(el).click();

      expect(host.confirmed).toHaveBeenCalledWith({ reason: 'Motivo', password: 'senha-forte-123' });
    });

    it('falha de senha aparece dentro do diálogo, não fecha, limpa a senha e mantém o motivo', async () => {
      const { fixture, host, el } = await setup((h) => {
        h.requirePassword.set(true);
        h.requireReason.set(true);
      });
      await typeInto(fixture, reason(el), 'Motivo');
      await typeInto(fixture, password(el), 'errada');
      confirm(el).click();

      host.error.set('Senha incorreta.');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(dialog(el)).not.toBeNull();
      expect(text(el.querySelector('[data-testid="confirm-error"]'))).toBe('Senha incorreta.');
      expect(password(el).value).toBe('');
      expect(reason(el).value).toBe('Motivo');
      expect(host.cancelled).not.toHaveBeenCalled();
    });
  });

  it('ocupado: trava os botões e ignora Escape', async () => {
    const { host, el } = await setup((h) => h.busy.set(true));

    expect(confirm(el).disabled).toBe(true);
    confirm(el).click();
    dialog(el)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(host.confirmed).not.toHaveBeenCalled();
    expect(host.cancelled).not.toHaveBeenCalled();
  });

  it('ao reabrir, os campos voltam vazios (a senha nunca fica guardada)', async () => {
    const { fixture, host, el } = await setup((h) => {
      h.requirePassword.set(true);
      h.requireReason.set(true);
    });
    await typeInto(fixture, reason(el), 'Motivo');
    await typeInto(fixture, password(el), 'senha-forte-123');

    host.open.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    host.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(reason(el).value).toBe('');
    expect(password(el).value).toBe('');
  });
});
