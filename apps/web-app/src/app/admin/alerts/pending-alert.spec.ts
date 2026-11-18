import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AdminApi } from '../admin.api';
import { PendingAlert } from './pending-alert';

@Component({
  imports: [PendingAlert],
  template: `<gef-pending-alert [count]="count()" />`,
})
class Host {
  readonly count = signal<number | null>(null);
}

describe('PendingAlert', () => {
  const getAlertsMock = jest.fn();

  beforeEach(() => {
    getAlertsMock.mockReset();
    getAlertsMock.mockReturnValue(of({ pendingCommunications: 0 }));
  });

  async function setup(configure?: (host: Host) => void) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AdminApi,
          useValue: { getAlerts: getAlertsMock },
        },
      ],
    });

    const fixture = TestBed.createComponent(Host);
    configure?.(fixture.componentInstance);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('não exibe nada quando não há comunicações pendentes (count = 0)', async () => {
    const { el } = await setup((h) => h.count.set(0));

    expect(el.querySelector('[data-testid="pending-communications-alert"]')).toBeNull();
  });

  it('exibe alerta permanente com ícone, mensagem singular e link para pendências quando count = 1', async () => {
    const { el } = await setup((h) => h.count.set(1));

    const alert = el.querySelector('[data-testid="pending-communications-alert"]') as HTMLElement;
    expect(alert).not.toBeNull();
    expect(alert.querySelector('gef-icon')).not.toBeNull();
    expect(alert.querySelector('[data-testid="pending-alert-message"]')?.textContent).toContain(
      '1 comunicação com envio pendente de e-mail',
    );
    expect(alert.querySelector('[data-testid="pending-alert-message"]')?.textContent).toContain('Existe 1 comunicação');

    const link = el.querySelector('[data-testid="pending-alert-link"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/admin/communications/pending');
  });

  it('pluraliza o texto quando count > 1', async () => {
    const { el } = await setup((h) => h.count.set(3));

    const alert = el.querySelector('[data-testid="pending-communications-alert"]') as HTMLElement;
    expect(alert).not.toBeNull();
    expect(alert.querySelector('[data-testid="pending-alert-message"]')?.textContent).toContain(
      '3 comunicações com envio pendente de e-mail',
    );
    expect(alert.querySelector('[data-testid="pending-alert-message"]')?.textContent).toContain('Existem 3');
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelector('[data-testid="pending-alert-link"]')?.className).toContain('min-h-11');
  });

  it('carrega automaticamente a contagem da API se nenhum count for passado', async () => {
    getAlertsMock.mockReturnValue(of({ pendingCommunications: 5 }));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AdminApi,
          useValue: { getAlerts: getAlertsMock },
        },
      ],
    });

    const fixture = TestBed.createComponent(PendingAlert);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(getAlertsMock).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[data-testid="pending-alert-message"]')?.textContent).toContain(
      '5 comunicações com envio pendente de e-mail',
    );
  });
});
