import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ACCOUNT_ICONS } from '@gefinc/core-models';
import { Icon } from './icon';
import { ICON_NAMES, ICON_SET, iconPaths } from './icon-set';

@Component({
  imports: [Icon],
  template: `
    <gef-icon name="home" />
    <gef-icon name="alert" label="Atenção" [size]="32" />
    <gef-icon name="inexistente" />
  `,
})
class Host {}

describe('catálogo de ícones', () => {
  it('toda chave do catálogo de contas tem desenho', () => {
    for (const key of ACCOUNT_ICONS) {
      expect(ICON_SET[key]?.length).toBeGreaterThan(0);
    }
  });

  it('navegação, ações, natureza e status têm desenho', () => {
    const needed = [
      'home', 'dashboard', 'list', 'invoice', 'cashflow', 'accounts', 'tag', 'user', 'logout', 'menu', 'close',
      'chevron-left', 'chevron-right', 'chevron-down', 'plus', 'arrow-up', 'arrow-down', 'check', 'clock', 'alert',
      'info', 'trash', 'edit', 'undo', 'more', 'filter', 'search', 'inbox', 'sun', 'moon', 'monitor',
    ];
    for (const key of needed) {
      expect(ICON_SET[key]?.length).toBeGreaterThan(0);
      expect(ICON_NAMES).toContain(key);
    }
  });

  it('todo desenho tem caminho não vazio', () => {
    for (const [name, paths] of Object.entries(ICON_SET)) {
      for (const path of paths) {
        expect(path.d.length).toBeGreaterThan(0);
      }
      expect(name).toMatch(/^[a-z-]+$/);
    }
  });

  it('chave desconhecida cai no ícone padrão', () => {
    expect(iconPaths('inexistente')).toBe(ICON_SET['wallet']);
    expect(iconPaths(null)).toBe(ICON_SET['wallet']);
  });
});

describe('gef-icon', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelectorAll('svg');
  }

  it('sem rótulo é decorativo (escondido de leitores de tela)', () => {
    const [decorative] = Array.from(render());
    expect(decorative.getAttribute('aria-hidden')).toBe('true');
    expect(decorative.getAttribute('role')).toBeNull();
    expect(decorative.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('com rótulo vira imagem acessível no tamanho pedido', () => {
    const [, labelled] = Array.from(render());
    expect(labelled.getAttribute('role')).toBe('img');
    expect(labelled.getAttribute('aria-label')).toBe('Atenção');
    expect(labelled.getAttribute('aria-hidden')).toBeNull();
    expect(labelled.getAttribute('width')).toBe('32');
  });

  it('usa currentColor para seguir a cor do texto', () => {
    const [first] = Array.from(render());
    expect(first.getAttribute('stroke')).toBe('currentColor');
  });
});
