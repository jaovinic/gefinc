import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NoticeService } from '@gefinc/ui-shared';
import { of, throwError } from 'rxjs';
import { AdminApi, type DeletionReason } from '../admin.api';
import { ReasonsPage } from './reasons-page';

describe('ReasonsPage', () => {
  const toastMock = jest.fn();
  const listMock = jest.fn();
  const createMock = jest.fn();
  const updateMock = jest.fn();
  const deactivateMock = jest.fn();
  const activateMock = jest.fn();

  const mockReasons: DeletionReason[] = [
    {
      id: 1,
      name: 'Solicitação do titular (LGPD)',
      message: 'Sua conta foi programada para exclusão a seu pedido com base na LGPD.',
      active: true,
      initial: true,
    },
    {
      id: 2,
      name: 'Violação dos termos de uso',
      message: 'Sua conta foi suspensa e programada para exclusão por violação dos termos de uso.',
      active: true,
      initial: true,
    },
    {
      id: 5,
      name: 'Motivo customizado inativo',
      message: 'Mensagem genérica para testes.',
      active: false,
      initial: false,
    },
  ];

  beforeEach(() => {
    toastMock.mockReset();
    listMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    deactivateMock.mockReset();
    activateMock.mockReset();

    listMock.mockReturnValue(of(mockReasons));
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
            listDeletionReasons: listMock,
            createDeletionReason: createMock,
            updateDeletionReason: updateMock,
            deactivateDeletionReason: deactivateMock,
            activateDeletionReason: activateMock,
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(ReasonsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function typeInto(fixture: { detectChanges(): void }, input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('lista motivos de exclusão identificando os iniciais e seus status', async () => {
    const { el } = await setup();

    const rows = el.querySelectorAll('[data-testid="reason-row"]');
    expect(rows).toHaveLength(3);

    const initialBadges = el.querySelectorAll('[data-testid="reason-badge-initial"]');
    expect(initialBadges).toHaveLength(2);

    expect(el.querySelector('[data-testid="reason-name"]')?.textContent).toContain('Solicitação do titular (LGPD)');
  });

  it('não possui botão de exclusão física na tabela de motivos', async () => {
    const { el } = await setup();

    const deleteButtons = Array.from(el.querySelectorAll('button')).filter(
      (b) => b.textContent?.toLowerCase().includes('excluir') || b.getAttribute('data-testid')?.includes('delete'),
    );
    expect(deleteButtons).toHaveLength(0);
  });

  it('cria novo motivo com sucesso através do modal', async () => {
    createMock.mockReturnValue(
      of({ id: 6, name: 'Inadimplência contratual', message: 'Conta cancelada por inadimplência.', active: true, initial: false }),
    );
    const { fixture, el } = await setup();

    const createBtn = el.querySelector('[data-testid="create-reason-btn"]') as HTMLButtonElement;
    createBtn.click();
    fixture.detectChanges();

    const modal = el.querySelector('[data-testid="reason-modal"]');
    expect(modal).not.toBeNull();

    const nameInput = el.querySelector('[data-testid="input-reason-name"]') as HTMLInputElement;
    const msgInput = el.querySelector('[data-testid="input-reason-message"]') as HTMLTextAreaElement;

    await typeInto(fixture, nameInput, 'Inadimplência contratual');
    await typeInto(fixture, msgInput, 'Conta cancelada por inadimplência.');

    const saveBtn = el.querySelector('[data-testid="modal-save-btn"]') as HTMLButtonElement;
    saveBtn.click();
    fixture.detectChanges();

    expect(createMock).toHaveBeenCalledWith({
      name: 'Inadimplência contratual',
      message: 'Conta cancelada por inadimplência.',
    });
    expect(toastMock).toHaveBeenCalledWith('Motivo de exclusão criado com sucesso.');
    expect(el.querySelector('[data-testid="reason-modal"]')).toBeNull();
  });

  it('o modal é um painel opaco acessível (gef-sheet) com título dinâmico e a tabela tem legenda e colunas rotuladas', async () => {
    const { fixture, el } = await setup();

    expect(el.querySelector('caption.sr-only')?.textContent).toContain('Motivos de exclusão');
    const headers = Array.from(el.querySelectorAll('thead th'));
    expect(headers.length).toBeGreaterThan(0);
    expect(headers.every((th) => th.getAttribute('scope') === 'col')).toBe(true);

    (el.querySelector('[data-testid="create-reason-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const dialog = el.querySelector('.gef-sheet[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Novo motivo de exclusão');
    expect(dialog.contains(el.querySelector('[data-testid="reason-modal"]'))).toBe(true);

    (el.querySelector('[data-testid="modal-cancel-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelectorAll('[data-testid="edit-reason-btn"]')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.gef-sheet')?.getAttribute('aria-label')).toBe('Editar motivo de exclusão');
  });

  it('valida campos obrigatórios ao salvar modal vazio', async () => {
    const { fixture, el } = await setup();

    const createBtn = el.querySelector('[data-testid="create-reason-btn"]') as HTMLButtonElement;
    createBtn.click();
    fixture.detectChanges();

    const saveBtn = el.querySelector('[data-testid="modal-save-btn"]') as HTMLButtonElement;
    saveBtn.click();
    fixture.detectChanges();

    expect(createMock).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="field-name-error"]')?.textContent).toContain('obrigatório');
    expect(el.querySelector('[data-testid="field-message-error"]')?.textContent).toContain('obrigatória');
  });

  it('edita motivo existente abrindo modal preenchido', async () => {
    updateMock.mockReturnValue(
      of({ id: 1, name: 'Solicitação do titular (LGPD)', message: 'Mensagem atualizada.', active: true, initial: true }),
    );
    const { fixture, el } = await setup();

    const editBtns = el.querySelectorAll('[data-testid="edit-reason-btn"]');
    (editBtns[0] as HTMLButtonElement).click();
    fixture.detectChanges();

    const nameInput = el.querySelector('[data-testid="input-reason-name"]') as HTMLInputElement;
    expect(nameInput.value).toBe('Solicitação do titular (LGPD)');

    const msgInput = el.querySelector('[data-testid="input-reason-message"]') as HTMLTextAreaElement;
    await typeInto(fixture, msgInput, 'Mensagem atualizada.');

    const saveBtn = el.querySelector('[data-testid="modal-save-btn"]') as HTMLButtonElement;
    saveBtn.click();
    fixture.detectChanges();

    expect(updateMock).toHaveBeenCalledWith(1, {
      name: 'Solicitação do titular (LGPD)',
      message: 'Mensagem atualizada.',
    });
    expect(toastMock).toHaveBeenCalledWith('Motivo de exclusão atualizado.');
  });

  it('desativa motivo ativo e exibe toast', async () => {
    deactivateMock.mockReturnValue(of(undefined));
    const { fixture, el } = await setup();

    const deactBtn = el.querySelector('[data-testid="deactivate-reason-btn"]') as HTMLButtonElement;
    deactBtn.click();
    fixture.detectChanges();

    expect(deactivateMock).toHaveBeenCalledWith(1);
    expect(toastMock).toHaveBeenCalledWith('Motivo de exclusão desativado.');
  });

  it('reativa motivo inativo e exibe toast', async () => {
    activateMock.mockReturnValue(of(undefined));
    const { fixture, el } = await setup();

    const actBtn = el.querySelector('[data-testid="activate-reason-btn"]') as HTMLButtonElement;
    actBtn.click();
    fixture.detectChanges();

    expect(activateMock).toHaveBeenCalledWith(5);
    expect(toastMock).toHaveBeenCalledWith('Motivo de exclusão reativado com sucesso.');
  });

  it('exibe erro de LAST_ACTIVE_REASON quando a desativação for recusada', async () => {
    deactivateMock.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { code: 'LAST_ACTIVE_REASON', detail: 'Ao menos um motivo de exclusão deve permanecer ativo.' },
          }),
      ),
    );
    const { fixture, el } = await setup();

    const deactBtn = el.querySelector('[data-testid="deactivate-reason-btn"]') as HTMLButtonElement;
    deactBtn.click();
    fixture.detectChanges();

    expect(toastMock).toHaveBeenCalledWith(expect.stringContaining('Ao menos um motivo'));
  });
});
