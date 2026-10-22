import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterLink, provideRouter } from '@angular/router';
import { Icon } from '@gefinc/ui-shared';
import { HomePage } from './home.page';

@Component({ selector: 'gef-dashboard-page', template: '' })
class DashboardStub {}

describe('HomePage', () => {
  function render() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.overrideComponent(HomePage, { set: { imports: [DashboardStub, Icon, RouterLink] } });
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('mostra "Nova despesa" e "Nova receita" lado a lado, com o mesmo destaque', () => {
    const el = render();
    const actions = Array.from(el.querySelectorAll<HTMLAnchorElement>('[data-testid="quick-actions"] a'));
    expect(actions.map((a) => a.textContent?.trim())).toEqual(['Nova despesa', 'Nova receita']);
    expect(actions[0].className).toBe(actions[1].className);
  });

  it('cada ação abre o lançamento rápido da sua natureza', () => {
    const el = render();
    expect(el.querySelector('a[href="/quick-expense"]')?.textContent).toContain('Nova despesa');
    expect(el.querySelector('a[href="/quick-income"]')?.textContent).toContain('Nova receita');
  });

  it('as ações têm ícone e sinal de natureza além da cor', () => {
    const el = render();
    for (const link of Array.from(el.querySelectorAll('[data-testid="quick-actions"] a'))) {
      expect(link.querySelector('svg')).not.toBeNull();
    }
  });
});
