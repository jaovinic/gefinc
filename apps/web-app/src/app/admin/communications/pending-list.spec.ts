import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NoticeService } from '@gefinc/ui-shared';
import { of, throwError } from 'rxjs';
import { AdminApi, type PendingCommunication } from '../admin.api';
import { PendingList } from './pending-list';

describe('PendingList', () => {
  const toastMock = jest.fn();
  const listMock = jest.fn();
  const resendMock = jest.fn();
  const discardMock = jest.fn();

  const mockItems: PendingCommunication[] = [
    {
      id: 10,
      kind: 'ACCOUNT_DELETION',
      targetLabel: 'usuario@teste.com',
      failureReason: 'Connection timed out',
      attempts: 2,
      createdAt: '2026-10-15T10:00:00Z',
      retainedUntil: '2026-11-14T10:00:00Z',
    },
    {
      id: 11,
      kind: 'DELETION_CANCELED',
      targetLabel: 'outro@teste.com',
      failureReason: 'SMTP 550 User unknown',
      attempts: 1,
      createdAt: '2026-10-16T12:00:00Z',
      retainedUntil: null,
    },
  ];

  beforeEach(() => {
    toastMock.mockReset();
    listMock.mockReset();
    resendMock.mockReset();
    discardMock.mockReset();

    listMock.mockReturnValue(of(mockItems));
  });

  async function setup() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: NoticeService, useValue: { toast: toastMock } },
        {
          provide: AdminApi,
          useValue: {
            listPendingCommunications: listMock,
            resendPendingCommunication: resendMock,
            discardPendingCommunication: discardMock,
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(PendingList);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lista as comunicações pendentes com dados formatados', async () => {
    const { el } = await setup();

    const rows = el.querySelectorAll('[data-testid="pending-row"]');
    expect(rows).toHaveLength(2);

    expect(el.querySelector('[data-testid="pending-target"]')?.textContent).toContain('usuario@teste.com');
    expect(el.querySelector('[data-testid="pending-kind"]')?.textContent).toContain('Aviso de exclusão');
    expect(el.querySelector('[data-testid="pending-failure"]')?.textContent).toContain('Connection timed out');
    expect(el.querySelector('[data-testid="pending-attempts"]')?.textContent).toContain('2');
  });

  it('exibe mensagem quando não há comunicações pendentes', async () => {
    listMock.mockReturnValue(of([]));
    const { el } = await setup();

    expect(el.querySelector('[data-testid="pending-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="pending-empty"]')?.textContent).toContain('Nenhuma comunicação pendente');
  });

  it('reenviar comunicação com sucesso remove a linha e exibe toast', async () => {
    resendMock.mockReturnValue(of({ state: 'DELIVERED' }));
    const { fixture, el } = await setup();

    const resendBtn = el.querySelector('[data-testid="resend-btn"]') as HTMLButtonElement;
    resendBtn.click();
    fixture.detectChanges();

    expect(resendMock).toHaveBeenCalledWith(10);
    expect(toastMock).toHaveBeenCalledWith('Comunicação entregue com sucesso.');
    expect(el.querySelectorAll('[data-testid="pending-row"]')).toHaveLength(1);
  });

  const dialog = () => document.querySelector('[role="alertdialog"]') as HTMLElement | null;
  const press = (testId: string) => (document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();

  it('"Descartar" só abre a confirmação (alertdialog) citando o destinatário; nada é descartado ainda', async () => {
    const { fixture, el } = await setup();

    (el.querySelector('[data-testid="discard-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(discardMock).not.toHaveBeenCalled();
    const box = dialog();
    expect(box).not.toBeNull();
    expect(box?.getAttribute('aria-label')).toBe('Descartar comunicação');
    expect(box?.textContent).toContain('usuario@teste.com');
    expect(box?.textContent).toContain('não será enviado');
    expect(box?.textContent).toContain('não pode ser desfeita');
    expect(box?.textContent).toContain('auditoria');
    expect(box?.querySelector('[data-testid="confirm-cancel"]')?.textContent?.trim()).toBe('Voltar');
    expect(box?.querySelector('[data-testid="confirm-confirm"]')?.textContent?.trim()).toBe('Descartar comunicação');
    expect(el.querySelectorAll('[data-testid="pending-row"]')).toHaveLength(2);
  });

  it('confirmar descarta a comunicação (id 10), exibe o toast e remove a linha', async () => {
    discardMock.mockReturnValue(of(undefined));
    const { fixture, el } = await setup();

    (el.querySelector('[data-testid="discard-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    press('confirm-confirm');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(discardMock).toHaveBeenCalledWith(10);
    expect(toastMock).toHaveBeenCalledWith('Comunicação descartada com sucesso.');
    expect(el.querySelectorAll('[data-testid="pending-row"]')).toHaveLength(1);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('[data-testid="pending-heading"]'));
  });

  it('"Voltar" fecha a confirmação sem descartar e mantém a linha', async () => {
    const { fixture, el } = await setup();

    (el.querySelector('[data-testid="discard-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    press('confirm-cancel');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(discardMock).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
    expect(el.querySelectorAll('[data-testid="pending-row"]')).toHaveLength(2);
  });

  it('falha ao descartar mantém o diálogo aberto com o erro dentro dele (sem toast) e a linha na lista', async () => {
    discardMock.mockReturnValue(throwError(() => ({ status: 500, error: { code: 'INTERNAL_ERROR' } })));
    const { fixture, el } = await setup();

    (el.querySelector('[data-testid="discard-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    press('confirm-confirm');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dialog()).not.toBeNull();
    expect(dialog()?.querySelector('[data-testid="confirm-error"]')?.textContent?.trim()).not.toBe('');
    expect(toastMock).not.toHaveBeenCalled();
    expect(el.querySelectorAll('[data-testid="pending-row"]')).toHaveLength(2);

    press('confirm-cancel');
    fixture.detectChanges();
    expect(dialog()).toBeNull();
  });

  it('os botões da linha são compactos de 44 px (gef-btn-sm)', async () => {
    const { el } = await setup();

    expect(el.querySelector('[data-testid="resend-btn"]')?.className).toContain('gef-btn-sm');
    expect(el.querySelector('[data-testid="discard-btn"]')?.className).toContain('gef-btn-sm');
  });

  it('exibe erro caso a consulta falhe', async () => {
    listMock.mockReturnValue(throwError(() => ({ status: 500, error: { message: 'Erro interno' } })));
    const { el } = await setup();

    expect(el.querySelector('gef-error')).not.toBeNull();
  });
});
