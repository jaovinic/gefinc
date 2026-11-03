import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');

/** Regra (seletor exato, no início da linha) até a chave que a fecha. */
function rule(selector: string): string {
  const start = css.search(new RegExp(`^\\s*${selector.replace(/[.[\]]/g, '\\$&')} \\{`, 'm'));
  if (start < 0) {
    throw new Error(`regra ${selector} ausente`);
  }
  return css.slice(start, css.indexOf('\n  }', start) + 4);
}

describe('styles.css do app móvel - desfoque da ilha e do botão flutuante', () => {
  it('a ilha desfoca pela variável, sem transform e com isolation: isolate', () => {
    const island = rule('.gef-tabbar');
    expect(island).toContain('-webkit-backdrop-filter: var(--glass-filter)');
    expect(island).toMatch(/[^-]backdrop-filter: var\(--glass-filter\)/);
    expect(island).toContain('isolation: isolate');
    expect(island).not.toMatch(/\btransform:/);
    expect(island).not.toContain('will-change');
  });

  it('só a cor do fundo da ilha transiciona: nunca filtro nem transform', () => {
    const island = rule('.gef-tabbar');
    expect(island).toMatch(/transition:\s*background-color [\d.]+s/);
    expect(island).not.toMatch(/transition:[^;]*(filter|transform)/);
  });

  it('o botão flutuante desfoca na folha; o contêiner fixed nunca leva filtro', () => {
    const action = rule('.gef-quick-action');
    expect(action).toContain('-webkit-backdrop-filter: var(--glass-filter)');
    expect(action).toMatch(/[^-]backdrop-filter: var\(--glass-filter\)/);
    const container = rule('.gef-quick-actions');
    expect(container).toContain('fixed');
    expect(container).not.toMatch(/filter|transform|will-change|opacity/);
  });

  it('o cabeçalho não desfoca e ninguém redeclara o blur como valor fixo nem "none" (só a variável muda)', () => {
    expect(rule('.gef-app-header')).not.toContain('backdrop-filter');
    for (const declaration of css.match(/backdrop-filter:[^;]+;/g) ?? []) {
      expect(declaration).toContain('var(--glass-filter)');
    }
  });

  it('a rolagem (data-scrolling) muda só variáveis: filtro none e fundos sólidos; nada de transform nem de propriedade de filtro', () => {
    const start = css.indexOf('html[data-scrolling] {');
    expect(start).toBeGreaterThan(-1);
    const body = css.slice(start, css.indexOf('\n}', start));
    expect(body).toContain('--glass-filter: none');
    expect(body).toContain('--glass-nav-bg: var(--glass-nav-bg-solid)');
    expect(body).toContain('--glass-fab-start: var(--glass-fab-start-solid)');
    expect(body).toContain('--glass-fab-end: var(--glass-fab-end-solid)');
    expect(body).not.toMatch(/^\s*(-webkit-)?backdrop-filter:|transform|#[0-9a-fA-F]{3,8}\b/m);
  });
});
