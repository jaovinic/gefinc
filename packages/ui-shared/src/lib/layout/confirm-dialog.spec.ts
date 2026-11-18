import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmDialog } from './confirm-dialog';

@Component({
  imports: [ConfirmDialog],
  template: `
    <button id="opener" type="button">abrir</button>
    <gef-confirm-dialog
      heading="Excluir conta"
      confirmLabel='Excluir conta "Nubank"'
      [open]="open()"
      [busy]="busy()"
      [error]="error()"
      [blocked]="blocked()"
      [confirmIcon]="icon()"
      (confirmed)="confirmed()"
      (cancelled)="cancelled()"
    >
      <p id="description">A conta será excluída definitivamente.</p>
      <button gefConfirmExtra type="button" id="extra" class="gef-btn-secondary">Inativar conta</button>
    </gef-confirm-dialog>
  `,
})
class Host {
  readonly open = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly blocked = signal<string | null>(null);
  readonly icon = signal<string | null>(null);
  readonly confirmed = jest.fn();
  readonly cancelled = jest.fn();
}

describe('ConfirmDialog', () => {
  async function setup(configure?: (host: Host) => void) {
    const fixture = TestBed.createComponent(Host);
    configure?.(fixture.componentInstance);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, host: fixture.componentInstance, el };
  }
  const dialog = (el: HTMLElement) => el.querySelector('[role="alertdialog"]') as HTMLElement;
  const confirm = (el: HTMLElement) => el.querySelector('[data-testid="confirm-confirm"]') as HTMLButtonElement | null;
  const cancel = (el: HTMLElement) => el.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement;

  it('não renderiza nada fechado', async () => {
    const { el } = await setup((h) => h.open.set(false));
    expect(dialog(el)).toBeNull();
  });

  it('abre como alertdialog descrito pelo texto e com o foco em Cancelar', async () => {
    const { el } = await setup();
    const box = dialog(el);
    expect(box).not.toBeNull();
    expect(box.getAttribute('aria-modal')).toBe('true');
    const describedBy = box.getAttribute('aria-describedby') as string;
    expect(el.querySelector('#' + describedBy)?.textContent).toContain('será excluída definitivamente');
    expect(document.activeElement).toBe(cancel(el));
    expect(cancel(el).textContent?.trim()).toBe('Cancelar');
    expect(confirm(el)?.textContent?.trim()).toBe('Excluir conta "Nubank"');
    expect(confirm(el)?.classList.contains('gef-btn-danger')).toBe(true);
  });

  it('o erro e os botões ficam juntos no rodapé fixo do painel (gef-sheet-actions), com o erro antes dos botões', async () => {
    const { el } = await setup((h) => h.error.set('Falha ao excluir'));
    const actions = dialog(el).querySelector('.gef-sheet-actions') as HTMLElement;

    expect(actions).not.toBeNull();
    expect(actions.contains(cancel(el))).toBe(true);
    expect(actions.contains(confirm(el))).toBe(true);
    expect(actions.contains(el.querySelector('#extra'))).toBe(true);
    const error = actions.querySelector('[data-testid="confirm-error"]') as HTMLElement;
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.compareDocumentPosition(cancel(el)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actions.contains(el.querySelector('#description'))).toBe(false);
  });

  it('os botões não repetem classes de altura (a altura de 44 px vem das classes de botão)', async () => {
    const { el } = await setup();

    expect(cancel(el).className).not.toMatch(/min-h-|md:/);
    expect(confirm(el)?.className).not.toMatch(/min-h-/);
  });

  it('Confirmar emite confirmed; Cancelar, Escape e fundo emitem cancelled', async () => {
    const { host, el } = await setup();
    confirm(el)?.click();
    expect(host.confirmed).toHaveBeenCalledTimes(1);

    cancel(el).click();
    expect(host.cancelled).toHaveBeenCalledTimes(1);
    dialog(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host.cancelled).toHaveBeenCalledTimes(2);
    (el.querySelector('.gef-sheet-backdrop') as HTMLElement).click();
    expect(host.cancelled).toHaveBeenCalledTimes(3);
    expect(host.confirmed).toHaveBeenCalledTimes(1);
  });

  it('ocupado: trava os botões, troca o texto e ignora Escape e fundo', async () => {
    const { host, el } = await setup((h) => h.busy.set(true));
    expect(confirm(el)?.disabled).toBe(true);
    expect(confirm(el)?.textContent?.trim()).toBe('Excluindo…');
    expect(cancel(el).disabled).toBe(true);

    confirm(el)?.click();
    dialog(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    (el.querySelector('.gef-sheet-backdrop') as HTMLElement).click();
    expect(host.confirmed).not.toHaveBeenCalled();
    expect(host.cancelled).not.toHaveBeenCalled();
  });

  it('o botão da ação pode ter um ícone ao lado do texto, sem trocar o texto', async () => {
    const { el } = await setup((h) => h.icon.set('alert'));

    expect(confirm(el)?.querySelector('gef-icon')).not.toBeNull();
    expect(confirm(el)?.textContent?.trim()).toBe('Excluir conta "Nubank"');
  });

  it('sem ícone informado o botão continua só com o texto', async () => {
    const { el } = await setup();

    expect(confirm(el)?.querySelector('gef-icon')).toBeNull();
  });

  it('mostra o erro dentro do diálogo, sem fechá-lo', async () => {
    const { el } = await setup((h) => h.error.set('Falha ao excluir.'));
    const alert = el.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Falha ao excluir.');
    expect(dialog(el)).not.toBeNull();
    expect(confirm(el)).not.toBeNull();
  });

  it('bloqueado: mostra o motivo, só Fechar e a ação alternativa, sem o botão destrutivo', async () => {
    const { host, el } = await setup((h) => h.blocked.set('A conta possui 3 lançamentos.'));
    expect(el.querySelector('[data-testid="confirm-blocked"]')?.textContent).toContain('possui 3 lançamentos');
    expect(el.querySelector('#description')).toBeNull();
    expect(confirm(el)).toBeNull();
    expect(cancel(el).textContent?.trim()).toBe('Fechar');
    expect(el.querySelector('#extra')).not.toBeNull();

    cancel(el).click();
    expect(host.cancelled).toHaveBeenCalledTimes(1);
  });

  it('devolve o foco a quem abriu ao fechar', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.open.set(false);
    fixture.detectChanges();
    const opener = (fixture.nativeElement as HTMLElement).querySelector('#opener') as HTMLElement;
    opener.focus();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.open.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(opener);
  });
});
