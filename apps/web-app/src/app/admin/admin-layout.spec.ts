import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { AdminApi } from './admin.api';
import { AdminLayout } from './admin-layout';

@Component({ template: '<p data-testid="child">conteúdo da área</p>' })
class Child {}

describe('AdminLayout (casca do painel)', () => {
  async function render() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'admin', component: AdminLayout, children: [{ path: 'users', component: Child }] }]),
        {
          provide: AdminApi,
          useValue: { getAlerts: () => of({ pendingCommunications: 0 }) },
        },
      ],
    });
    const harness = await RouterTestingHarness.create('/admin/users');
    const el = harness.routeNativeElement as HTMLElement;
    return { harness, el };
  }

  it('tem um único título de primeiro nível, "Administração"', async () => {
    const { el } = await render();
    const headings = el.querySelectorAll('h1');

    expect(headings).toHaveLength(1);
    expect(headings[0].textContent?.trim()).toBe('Administração');
  });

  it('mostra a área filha dentro da casca', async () => {
    const { el } = await render();

    expect(el.querySelector('[data-testid="child"]')?.textContent).toContain('conteúdo da área');
  });

  it('reserva a região de alerta permanente, vazia, anunciada como alerta', async () => {
    const { el } = await render();
    const alert = el.querySelector('[data-testid="admin-alert"]') as HTMLElement;

    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent?.trim()).toBe('');
  });

  it('reserva a região de estado, educada, para avisos de carregamento e resultado', async () => {
    const { el } = await render();
    const status = el.querySelector('[data-testid="admin-status"]') as HTMLElement;

    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('não usa tabindex positivo: a ordem do teclado é a do documento', async () => {
    const { el } = await render();
    const positive = Array.from(el.querySelectorAll('[tabindex]')).filter((node) => Number(node.getAttribute('tabindex')) > 0);

    expect(positive).toHaveLength(0);
  });
});
