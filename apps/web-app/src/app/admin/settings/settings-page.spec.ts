import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL, NoticeService } from '@gefinc/ui-shared';
import { SettingsPage } from './settings-page';

describe('SettingsPage', () => {
  let fixture: ComponentFixture<SettingsPage>;
  let component: SettingsPage;
  let http: HttpTestingController;
  let notices: NoticeService;

  const mockParams = {
    editable: [
      {
        key: 'SIGNUPS_OPEN',
        value: 'true',
        updatedAt: '2026-11-17T10:00:00Z',
        updatedBy: { userId: 1, label: 'admin@gefinc.com' },
        editable: true,
      },
      {
        key: 'MAINTENANCE_ENABLED',
        value: 'false',
        updatedAt: '2026-11-17T09:00:00Z',
        updatedBy: { userId: 1, label: 'admin@gefinc.com' },
        editable: true,
      },
      {
        key: 'MAINTENANCE_MESSAGE',
        value: 'Manutenção em andamento',
        updatedAt: '2026-11-17T09:00:00Z',
        updatedBy: { userId: 1, label: 'admin@gefinc.com' },
        editable: true,
      },
    ],
    readOnly: [
      { key: 'REFRESH_TOKEN_TTL', value: '7 dias', label: 'Validade da sessão', editable: false },
      { key: 'ACCESS_TOKEN_TTL', value: '15 minutos', label: 'Validade do token de acesso', editable: false },
      { key: 'ACCOUNT_DELETION_GRACE_DAYS', value: '30 dias', label: 'Carência de exclusão', editable: false },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: '/api/v1' },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    notices = TestBed.inject(NoticeService);
    fixture = TestBed.createComponent(SettingsPage);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    http.verify();
  });

  function loadInitial(): void {
    fixture.detectChanges();
    const req = http.expectOne('/api/v1/admin/parameters');
    req.flush(mockParams);
    fixture.detectChanges();
  }

  it('carrega e exibe os parâmetros editáveis e somente leitura', () => {
    loadInitial();

    expect(component.signupsOpen()).toBe(true);
    expect(component.maintenanceEnabled()).toBe(false);
    expect(component.maintenanceMessage()).toBe('Manutenção em andamento');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="signups-status-badge"]')?.textContent).toContain('Cadastros abertos');
    expect(el.querySelector('[data-testid="maint-status-badge"]')?.textContent).toContain('Operação normal');

    const readOnlySection = el.querySelector('[data-testid="readonly-parameters"]');
    expect(readOnlySection).not.toBeNull();
    expect(readOnlySection?.textContent).toContain('Validade da sessão');
    expect(readOnlySection?.textContent).toContain('7 dias');
    expect(readOnlySection?.textContent).toContain('15 minutos');
    expect(readOnlySection?.textContent).toContain('Somente leitura');
  });

  it('alterna o estado de abertura de novos cadastros', () => {
    loadInitial();
    const toastSpy = jest.spyOn(notices, 'toast');

    const toggleBtn = fixture.nativeElement.querySelector('[data-testid="signups-toggle-btn"]') as HTMLButtonElement;
    expect(toggleBtn.textContent).toContain('Fechar novos cadastros');
    toggleBtn.click();
    fixture.detectChanges();

    const putReq = http.expectOne('/api/v1/admin/parameters/signups-open');
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.body).toEqual({ open: false });
    putReq.flush(null, { status: 204, statusText: 'No Content' });

    // Recarrega os parâmetros
    const reloadReq = http.expectOne('/api/v1/admin/parameters');
    reloadReq.flush({
      ...mockParams,
      editable: mockParams.editable.map((p) => (p.key === 'SIGNUPS_OPEN' ? { ...p, value: 'false' } : p)),
    });
    fixture.detectChanges();

    expect(component.signupsOpen()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('Novos cadastros fechados.');
  });

  it('alterna o modo de manutenção com mensagem personalizada', () => {
    loadInitial();
    const toastSpy = jest.spyOn(notices, 'toast');

    component.maintenanceMessage.set('Atualização de infraestrutura programada');
    fixture.detectChanges();

    const toggleBtn = fixture.nativeElement.querySelector('[data-testid="maint-toggle-btn"]') as HTMLButtonElement;
    expect(toggleBtn.textContent).toContain('Ativar modo de manutenção');
    toggleBtn.click();
    fixture.detectChanges();

    const putReq = http.expectOne('/api/v1/admin/parameters/maintenance');
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.body).toEqual({
      enabled: true,
      message: 'Atualização de infraestrutura programada',
    });
    putReq.flush(null, { status: 204, statusText: 'No Content' });

    const reloadReq = http.expectOne('/api/v1/admin/parameters');
    reloadReq.flush({
      ...mockParams,
      editable: mockParams.editable.map((p) => (p.key === 'MAINTENANCE_ENABLED' ? { ...p, value: 'true' } : p)),
    });
    fixture.detectChanges();

    expect(component.maintenanceEnabled()).toBe(true);
    expect(toastSpy).toHaveBeenCalledWith('Modo de manutenção ativado.');
  });

  it('exige confirmação pela palavra ENCERRAR e senha para revogação global', () => {
    loadInitial();
    const toastSpy = jest.spyOn(notices, 'toast');

    // Abre diálogo de emergência
    const openBtn = fixture.nativeElement.querySelector('[data-testid="revoke-all-open-btn"]') as HTMLButtonElement;
    openBtn.click();
    fixture.detectChanges();

    expect(component.revokeDialogOpen()).toBe(true);

    // Tenta confirmar com palavra errada
    component.confirmWord.set('CANCELAR');
    component.adminPassword.set('senhaAdmin123');
    component.confirmRevokeAll();
    fixture.detectChanges();

    expect(component.revokeError()).toContain('Digite exatamente a palavra ENCERRAR');
    http.expectNone('/api/v1/admin/sessions/revoke-all');

    // Preenche a palavra certa 'ENCERRAR' e confirma
    component.confirmWord.set('ENCERRAR');
    component.confirmRevokeAll();
    fixture.detectChanges();

    const req = http.expectOne('/api/v1/admin/sessions/revoke-all');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      password: 'senhaAdmin123',
      confirmWord: 'ENCERRAR',
    });
    req.flush({ revoked: 12 });
    fixture.detectChanges();

    expect(component.revokeDialogOpen()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('12 sessões encerradas.');
  });
});
