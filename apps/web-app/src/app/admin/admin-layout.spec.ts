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
  async function render(pending = 0) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'admin', component: AdminLayout, children: [{ path: 'users', component: Child }] }]),
        {
          provide: AdminApi,
          useValue: { getAlerts: () => of({ pendingCommunications: pending }) },
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

  it('com comunicações pendentes há exatamente um role="alert" no DOM (o invólucro), com o aviso dentro', async () => {
    const { harness, el } = await render(2);
    harness.detectChanges();

    const alerts = el.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].getAttribute('data-testid')).toBe('admin-alert');
    expect(alerts[0].querySelector('[data-testid="pending-communications-alert"]')).not.toBeNull();
  });

  it('a região de alerta vazia não deixa vão (compensa o espaçamento) e a de estado só é lida, nunca vista', async () => {
    const { el } = await render();

    expect((el.querySelector('[data-testid="admin-alert"]') as HTMLElement).className).toContain('not-has-[[data-testid=pending-communications-alert]]:-mt-4');
    expect((el.querySelector('[data-testid="admin-status"]') as HTMLElement).classList.contains('sr-only')).toBe(true);
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
