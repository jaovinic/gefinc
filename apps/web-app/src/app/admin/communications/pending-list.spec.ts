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

  it('descartar comunicação remove a linha e exibe toast', async () => {
    discardMock.mockReturnValue(of(undefined));
    const { fixture, el } = await setup();

    const discardBtn = el.querySelector('[data-testid="discard-btn"]') as HTMLButtonElement;
    discardBtn.click();
    fixture.detectChanges();

    expect(discardMock).toHaveBeenCalledWith(10);
    expect(toastMock).toHaveBeenCalledWith('Comunicação descartada com sucesso.');
    expect(el.querySelectorAll('[data-testid="pending-row"]')).toHaveLength(1);
  });

  it('exibe erro caso a consulta falhe', async () => {
    listMock.mockReturnValue(throwError(() => ({ status: 500, error: { message: 'Erro interno' } })));
    const { el } = await setup();

    expect(el.querySelector('gef-error')).not.toBeNull();
  });
});
