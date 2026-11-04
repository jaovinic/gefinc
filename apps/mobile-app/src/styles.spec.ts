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

  it('a ilha nunca anima filtro nem transform', () => {
    const island = rule('.gef-tabbar');
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

  it('não há pausa do desfoque na rolagem: nenhuma regra de data-scrolling nem variável trocada por rolagem', () => {
    expect(css).not.toContain('data-scrolling');
    expect(css).not.toContain('html[data-scrolling]');
  });

  it('o botão flutuante não tem reflexo inferior nem will-change; sombra externa e realce fino continuam', () => {
    const action = rule('.gef-quick-action');
    expect(action).not.toMatch(/inset 0 -\d+px/);
    expect(action).not.toContain('will-change');
    expect(action).toContain('inset 0 1px 0 var(--glass-fab-rim)');
    expect(action).toMatch(/0 12px 28px -12px rgb\(0 180 216/);
  });
});
