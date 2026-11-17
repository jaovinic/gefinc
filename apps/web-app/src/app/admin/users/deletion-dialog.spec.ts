import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DeletionReason, DeletionRequestInput } from '../admin.api';
import { DeletionDialog } from './deletion-dialog';

@Component({
  imports: [DeletionDialog],
  template: `
    <gef-deletion-dialog
      [open]="open()"
      [targetEmail]="targetEmail()"
      [reasons]="reasons()"
      [currentDueAt]="currentDueAt()"
      [busy]="busy()"
      [error]="error()"
      (confirmed)="confirmed($event)"
      (cancelled)="cancelled()"
    />
  `,
})
class Host {
  readonly open = signal(true);
  readonly targetEmail = signal('alvo@teste.com');
  readonly reasons = signal<DeletionReason[]>([
    { id: 1, name: 'Solicitação do titular (LGPD)', message: 'Mensagem 1', active: true, initial: true },
    { id: 2, name: 'Violação dos termos de uso', message: 'Mensagem 2', active: true, initial: true },
    { id: 3, name: 'Motivo antigo desativado', message: 'Mensagem inativa', active: false, initial: false },
  ]);
  readonly currentDueAt = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly confirmed = jest.fn<void, [DeletionRequestInput]>();
  readonly cancelled = jest.fn();
}

describe('DeletionDialog', () => {
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
  const cancelBtn = (el: HTMLElement) => el.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement;
  const reasonSelect = (el: HTMLElement) => el.querySelector('[data-testid="deletion-reason-select"]') as HTMLSelectElement;
  const justification = (el: HTMLElement) => el.querySelector('[data-testid="deletion-justification"]') as HTMLTextAreaElement;
  const modeImmediate = (el: HTMLElement) => el.querySelector('[data-testid="mode-immediate"]') as HTMLInputElement;
  const daysInput = (el: HTMLElement) => el.querySelector('[data-testid="deletion-days-input"]') as HTMLInputElement;
  const confirmEmail = (el: HTMLElement) => el.querySelector('[data-testid="deletion-confirm-email"]') as HTMLInputElement;
  const password = (el: HTMLElement) => el.querySelector('[data-testid="deletion-password"]') as HTMLInputElement;

  async function typeInto(fixture: { detectChanges(): void }, input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('abre como diálogo de alerta com aviso LGPD de privacidade e lista motivos ativos', async () => {
    const { el } = await setup();

    expect(dialog(el)).not.toBeNull();
    const notice = el.querySelector('[data-testid="privacy-notice"]');
    expect(notice?.textContent).toContain('NÃO escreva dados pessoais do usuário');
    expect(notice?.textContent).toContain('trilha de auditoria');

    const options = Array.from(reasonSelect(el).querySelectorAll('option')).map((o) => o.textContent?.trim());
    expect(options).toContain('Solicitação do titular (LGPD)');
    expect(options).toContain('Violação dos termos de uso');
    expect(options).not.toContain('Motivo antigo desativado');
  });

  it('exibe textos de antecipação quando a conta já possui dueAt', async () => {
    const { el } = await setup((h) => h.currentDueAt.set('2026-12-01T00:00:00Z'));

    const heading = el.querySelector('h2');
    expect(heading?.textContent?.trim()).toBe('Antecipar exclusão da conta');
    expect(confirmBtn(el).textContent?.trim()).toBe('Antecipar exclusão');
  });

  it('alterna para modo imediato e exibe alerta de irreversibilidade', async () => {
    const { fixture, el } = await setup();

    expect(el.querySelector('[data-testid="grace-days-container"]')).not.toBeNull();

    modeImmediate(el).click();
    modeImmediate(el).dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="grace-days-container"]')).toBeNull();
    const warning = el.querySelector('[data-testid="deletion-effect-warning"]');
    expect(warning?.textContent).toContain('ATENÇÃO — Efeito imediato e irreversível');
  });

  it('valida campos obrigatórios ao clicar em confirmar', async () => {
    const { fixture, host, el } = await setup();

    confirmBtn(el).click();
    fixture.detectChanges();

    expect(host.confirmed).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="deletion-reason-error"]')?.textContent).toContain('Selecione um motivo');
    expect(el.querySelector('[data-testid="deletion-justification-error"]')?.textContent).toContain('Informe a justificativa');
    expect(el.querySelector('[data-testid="deletion-email-error"]')?.textContent).toContain('e-mail digitado deve ser exatamente igual');
    expect(el.querySelector('[data-testid="deletion-password-error"]')?.textContent).toContain('Informe sua senha');
  });

  it('valida prazo de carência fora do intervalo de 1 a 30 dias', async () => {
    const { fixture, host, el } = await setup();

    reasonSelect(el).value = '1';
    reasonSelect(el).dispatchEvent(new Event('change'));
    await typeInto(fixture, justification(el), 'Solicitação de exclusão com base na LGPD');
    await typeInto(fixture, daysInput(el), '45');
    await typeInto(fixture, confirmEmail(el), 'alvo@teste.com');
    await typeInto(fixture, password(el), 'senha-admin');

    confirmBtn(el).click();
    fixture.detectChanges();

    expect(host.confirmed).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="deletion-days-error"]')?.textContent).toContain('entre 1 e 30 dias');
  });

  it('emite confirmed com todos os dados preenchidos corretamente', async () => {
    const { fixture, host, el } = await setup();

    reasonSelect(el).value = '1';
    reasonSelect(el).dispatchEvent(new Event('change'));
    await typeInto(fixture, justification(el), 'Exclusão solicitada formalmente pelo titular');
    await typeInto(fixture, daysInput(el), '15');
    await typeInto(fixture, confirmEmail(el), 'alvo@teste.com');
    await typeInto(fixture, password(el), 'senha-segura');

    confirmBtn(el).click();
    fixture.detectChanges();

    expect(host.confirmed).toHaveBeenCalledTimes(1);
    expect(host.confirmed).toHaveBeenCalledWith({
      reasonId: 1,
      justification: 'Exclusão solicitada formalmente pelo titular',
      mode: 'GRACE',
      days: 15,
      confirmEmail: 'alvo@teste.com',
      password: 'senha-segura',
    });
  });

  it('cancela fecha o diálogo sem emitir confirmed', async () => {
    const { host, el } = await setup();

    cancelBtn(el).click();

    expect(host.cancelled).toHaveBeenCalledTimes(1);
    expect(host.confirmed).not.toHaveBeenCalled();
  });
});
