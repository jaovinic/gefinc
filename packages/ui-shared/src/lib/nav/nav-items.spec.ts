import { ICON_SET } from '../icons/icon-set';
import { NAV_ITEMS } from './nav-items';

describe('NAV_ITEMS', () => {
  it('lista as áreas do sistema na ordem do menu', () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      'Painel',
      'Lançamentos',
      'Faturas',
      'Fluxo de caixa',
      'Contas e cartões',
      'Categorias',
      'Minha conta',
    ]);
  });

  it('cada item tem ícone desenhado e rotas do web e do app', () => {
    for (const item of NAV_ITEMS) {
      expect(ICON_SET[item.icon]?.length).toBeGreaterThan(0);
      expect(item.web.startsWith('/')).toBe(true);
      expect(item.app.startsWith('/')).toBe(true);
    }
  });

  it('as chaves e as rotas do web não se repetem', () => {
    expect(new Set(NAV_ITEMS.map((i) => i.key)).size).toBe(NAV_ITEMS.length);
    expect(new Set(NAV_ITEMS.map((i) => i.web)).size).toBe(NAV_ITEMS.length);
  });

  it('os caminhos batem com as rotas existentes', () => {
    const byKey = Object.fromEntries(NAV_ITEMS.map((i) => [i.key, i]));
    expect(byKey['transactions'].web).toBe('/transactions');
    expect(byKey['transactions'].app).toBe('/lancamentos');
    expect(byKey['settings'].web).toBe('/settings');
    expect(byKey['settings'].app).toBe('/minha-conta');
  });
});
