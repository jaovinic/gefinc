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

  it('mostra um único botão destacado "Novo lançamento"', () => {
    const el = render();
    const actions = Array.from(el.querySelectorAll<HTMLAnchorElement>('[data-testid="quick-actions"] a'));
    expect(actions.map((a) => a.textContent?.trim())).toEqual(['Novo lançamento']);
  });

  it('o botão abre a tela de novo lançamento, onde se escolhe a natureza', () => {
    const el = render();
    expect(el.querySelector('a[href="/novo"]')?.textContent).toContain('Novo lançamento');
    expect(el.querySelector('a[href="/quick-expense"]')).toBeNull();
    expect(el.querySelector('a[href="/quick-income"]')).toBeNull();
  });

  it('o botão tem ícone de adicionar além do texto', () => {
    const el = render();
    expect(el.querySelector('[data-testid="quick-actions"] a svg')).not.toBeNull();
  });
});
