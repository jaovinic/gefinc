import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, 'theme.css'), 'utf8');
/** Estilos só do web (menu lateral, barra do topo, tabelas do painel): fora do pacote do app móvel. */
const webCss = readFileSync(join(__dirname, 'web.css'), 'utf8');
const mobileStyles = readFileSync(join(__dirname, '../../../../apps/mobile-app/src/styles.css'), 'utf8');
const webStyles = readFileSync(join(__dirname, '../../../../apps/web-app/src/styles.css'), 'utf8');

describe('theme.css - foco neutro nos campos de digitação', () => {
  it('define o token de foco neutro', () => {
    expect(css).toContain('--color-gefinc-focus: #94a3b8');
  });

  it('nenhum campo usa borda verde no foco', () => {
    expect(css).not.toContain('focus:border-gefinc-primary');
    expect(css).not.toContain('focus-within:border-gefinc-primary');
  });

  it('o campo comum e o campo de valor focam com o token neutro', () => {
    expect(css).toContain('focus:border-gefinc-focus');
    expect(css).toMatch(/\.gef-money-field:focus-within\s*\{[^}]*border-gefinc-focus/);
  });

  it('a regra de foco dos campos vem fora de camada, depois do anel global, e usa o token neutro', () => {
    const globalRing = css.indexOf(':focus-visible {');
    const fieldRule = css.indexOf("input:not([type='checkbox']):not([type='radio']):focus-visible,");
    const firstLayer = css.indexOf('@layer components');
    expect(globalRing).toBeGreaterThan(-1);
    expect(fieldRule).toBeGreaterThan(globalRing);
    expect(fieldRule).toBeLessThan(firstLayer);
    const block = css.slice(fieldRule, css.indexOf('}', fieldRule));
    expect(block).toContain('.gef-input:focus-visible');
    expect(block).toContain('var(--color-gefinc-focus)');
    expect(block).not.toContain('secondary');
    expect(block).not.toContain('primary');
  });

  it('o foco do campo de valor vem do invólucro, não do input', () => {
    expect(css).toMatch(/\.gef-money-field input[^{]*:focus-visible\s*\{\s*outline:\s*none/);
  });

  it('campo inválido continua vencendo na borda', () => {
    expect(css).toMatch(/\.gef-input\[aria-invalid='true'\]\s*\{[^}]*border-gefinc-danger/);
  });

  it('a escolha de natureza tem tom por natureza', () => {
    expect(css).toContain(".gef-segment[data-kind='EXPENSE']:has(input:checked)");
    expect(css).toContain(".gef-segment[data-kind='INCOME']:has(input:checked)");
  });
});

describe('theme.css - indicadores do painel no celular', () => {
  it('o valor dos indicadores comuns é limitado a 1.5rem e não quebra linha', () => {
    expect(css).toMatch(/\.gef-kpi \.financial-value\s*\{[^}]*clamp\(0\.8125rem, 12cqw, 1\.5rem\)[^}]*white-space:\s*nowrap/);
  });

  it('o saldo geral tem exceção maior, até 2rem, também por container query', () => {
    expect(css).toMatch(/\.gef-kpi\[data-indicator='balance-total'\] \.financial-value\s*\{[^}]*clamp\(1\.25rem, 9cqw, 2rem\)/);
  });

  it('a exceção do saldo geral vem depois da regra geral para vencê-la', () => {
    expect(css.indexOf(".gef-kpi[data-indicator='balance-total']")).toBeGreaterThan(css.indexOf('.gef-kpi .financial-value'));
  });
});

describe('theme.css - tema claro e Liquid Glass', () => {
  it('o tema claro troca as variáveis por data-theme, sem variantes dark:', () => {
    expect(css).toContain("html[data-theme='light']");
    expect(css).toContain("html[data-theme='dark']");
    expect(css).not.toMatch(/\bdark:/);
  });

  it('o foco neutro do tema claro vem do token (cinza-ardósia escuro)', () => {
    expect(block("html[data-theme='light']")).toContain('--color-gefinc-focus: #475569');
  });

  it('define os tokens do vidro nos dois temas', () => {
    for (const token of ['--glass-bg', '--glass-bg-strong', '--glass-border', '--glass-highlight', '--glass-shadow', '--glass-blur', '--glass-saturate']) {
      expect(block(':root')).toContain(`${token}:`);
    }
    for (const token of ['--glass-bg', '--glass-bg-strong', '--glass-border', '--glass-highlight', '--glass-shadow']) {
      expect(block("html[data-theme='light']")).toContain(`${token}:`);
    }
  });

  it('declara o desfoque com o prefixo -webkit- e tem alternativas opacas', () => {
    expect(css).toContain('-webkit-backdrop-filter');
    expect(css).toContain('@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))');
    expect(css).toContain('@media (prefers-reduced-transparency: reduce)');
    expect(css).toContain('@media (prefers-contrast: more)');
  });

  it('as alternativas opacas vêm depois do tema claro, para vencê-lo', () => {
    const light = css.indexOf("html[data-theme='light'] {");
    expect(css.indexOf('@media (prefers-reduced-transparency: reduce)')).toBeGreaterThan(light);
    expect(css.indexOf('@media (prefers-contrast: more)')).toBeGreaterThan(light);
    expect(css.indexOf('@supports not')).toBeGreaterThan(light);
  });

  it('o painel nunca ganha filtro: o desfoque do painel fica no fundo (painel dentro de painel usa position: fixed)', () => {
    const sheet = css.match(/\n {2}\.gef-sheet \{[^}]*\}/)?.[0] ?? '';
    expect(sheet).not.toContain('backdrop-filter');
    expect(css).toMatch(/\.gef-sheet-backdrop \{[^}]*backdrop-filter/);
  });

  it('os botões de marca usam o texto sobre fundo de marca, não o fundo do tema', () => {
    expect(css).toMatch(/\.gef-btn-primary \{[^}]*text-gefinc-on-accent/);
    expect(css).toMatch(/\.gef-btn-danger \{[^}]*text-gefinc-on-accent/);
    expect(css).not.toContain('text-gefinc-bg;');
  });

  it('não sobram hex soltos nas classes de componentes', () => {
    const components = css.slice(css.indexOf('@layer components'));
    expect(components).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(components).not.toContain('bg-black');
  });
});

describe('theme.css - controles próprios no lugar dos nativos', () => {
  it('não resta estilo para o seletor de data, a lista ou o seletor de cor do sistema', () => {
    expect(css).not.toContain("input[type='date']");
    expect(css).not.toContain("input[type='color']");
    expect(css).not.toMatch(/^select[,\s{]/m);
    expect(css).not.toContain('accent-color');
  });

  it('opção da lista, dia do calendário e cor da paleta têm alvo de 44 px (h-11 / min-h-11)', () => {
    expect(css).toMatch(/\.gef-option \{[^}]*min-h-11/);
    expect(css).toMatch(/\.gef-day \{[^}]*h-11/);
    expect(css).toMatch(/\.gef-swatch \{[^}]*h-11 w-11/);
  });

  it('o item escolhido não depende só da cor: borda, negrito e (nas cores) borda dupla', () => {
    expect(css).toMatch(/\.gef-option\[aria-selected='true'\] \{[^}]*border-gefinc-primary[^}]*font-semibold/);
    expect(css).toMatch(/\[role='gridcell'\]\[aria-selected='true'\] > \.gef-day \{[^}]*border-gefinc-primary[^}]*font-bold/);
    expect(css).toMatch(/\.gef-day\[aria-current='date'\] \{[^}]*underline/);
    expect(css).toMatch(/\.gef-swatch\[aria-checked='true'\] \{[^}]*border-2/);
  });

  it('as cores da paleta têm borda de contraste (tokens do tema, sem hex)', () => {
    expect(css).toMatch(/\.gef-swatch \{[^}]*border-gefinc-muted/);
  });
});

/** Corpo do primeiro bloco cujo seletor é exatamente `selector`. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('\n}', start));
}

function token(scope: string, name: string): string {
  const match = block(scope).match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) {
    throw new Error(`token ${name} ausente em ${scope}`);
  }
  return match[1].trim();
}

type Rgba = [number, number, number, number];

function parseColor(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const fn = value.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)$/);
  if (fn) {
    return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])];
  }
  throw new Error(`cor não reconhecida: ${value}`);
}

/** Compõe `top` (com transparência) sobre `bottom` opaco. */
function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1) as Rgba;
}

function luminance([r, g, b]: Rgba): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme.css - contraste WCAG AA (4,5:1) nos dois temas', () => {
  const scopes: [string, string][] = [
    ['escuro', '@theme'],
    ['claro', "html[data-theme='light']"],
  ];

  /** Lê o token do escopo; o que o tema claro não redefine vem do escuro. */
  const value = (scope: string, name: string): Rgba => {
    try {
      return parseColor(token(scope, name));
    } catch {
      return parseColor(token('@theme', name));
    }
  };

  describe.each(scopes)('tema %s', (_label, scope) => {
    const bg = value(scope, '--color-gefinc-bg');
    const surface = value(scope, '--color-gefinc-surface');
    const glass = over(parseColor(token(scope === '@theme' ? ':root' : scope, '--glass-bg')), bg);
    const strong = over(parseColor(token(scope === '@theme' ? ':root' : scope, '--glass-bg-strong')), bg);

    it.each(['text', 'muted', 'primary', 'secondary', 'danger', 'warning'])('texto %s sobre fundo, superfície e vidro', (name) => {
      const fg = value(scope, `--color-gefinc-${name}`);
      for (const background of [bg, surface, glass, strong]) {
        expect(contrast(fg, background)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('texto de marca sobre o tom translúcido da própria cor (alertas, pílulas, aba ativa)', () => {
      for (const [name, alpha] of [['primary', 0.15], ['primary', 0.1], ['danger', 0.1], ['warning', 0.1]] as const) {
        const fg = value(scope, `--color-gefinc-${name}`);
        const tint = over([fg[0], fg[1], fg[2], alpha], glass);
        const ratio = contrast(fg, tint);
        if (ratio < 4.5) {
          throw new Error(`${name} a ${alpha}: ${ratio.toFixed(2)}`);
        }
      }
    });

    it('texto sobre os fundos de marca (botões e avatar) usa a cor constante escura', () => {
      const onAccent = value(scope, '--color-gefinc-on-accent');
      for (const name of ['primary-fill', 'danger-fill']) {
        expect(contrast(onAccent, value(scope, `--color-gefinc-${name}`))).toBeGreaterThanOrEqual(4.5);
      }
    });

    it.each(['.gef-btn-primary', '.gef-btn-danger'])('%s passa em 4,5:1 também com o ponteiro em cima (hover reduz a opacidade do botão todo)', (selector) => {
      const start = css.indexOf(`${selector} {`);
      const rule = css.slice(start, css.indexOf('}', start));
      const hover = Number(rule.match(/hover:opacity-(\d+)/)?.[1] ?? '100') / 100;
      const fill = value(scope, `--color-gefinc-${selector === '.gef-btn-danger' ? 'danger' : 'primary'}-fill`);
      const onAccent = value(scope, '--color-gefinc-on-accent');
      for (const behind of [bg, surface]) {
        const text = over([onAccent[0], onAccent[1], onAccent[2], hover], behind);
        const background = over([fill[0], fill[1], fill[2], hover], behind);
        expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('o texto de perigo suave é legível sobre o tom de perigo', () => {
      const soft = value(scope, '--color-gefinc-danger-soft');
      const danger = value(scope, '--color-gefinc-danger');
      expect(contrast(soft, over([danger[0], danger[1], danger[2], 0.1], glass))).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe('theme.css - ilha, botão flutuante e desempenho do vidro no celular', () => {
  const scopes: [string, string][] = [
    ['escuro', ':root'],
    ['claro', "html[data-theme='light']"],
  ];
  const pick = (scope: string, name: string): Rgba => {
    try {
      return parseColor(token(scope, name));
    } catch {
      return parseColor(token(':root', name));
    }
  };
  const themeColor = (scope: string, name: string): Rgba => {
    try {
      return parseColor(token(scope === ':root' ? '@theme' : scope, name));
    } catch {
      return parseColor(token('@theme', name));
    }
  };

  /** Bloco de variáveis dos fallbacks e do modo sólido (do marcador até o fim do bloco). */
  const fallbackBlock = (marker: string): string => {
    const start = css.indexOf(marker);
    return start < 0 ? '' : css.slice(start, css.indexOf('\n}', start));
  };
  const FALLBACKS = ['@media (prefers-reduced-transparency: reduce) {', '@media (prefers-contrast: more) {', '@supports not ('];

  it('o desfoque é real por padrão: o filtro é uma variável com raio moderado e saturação leve', () => {
    const root = block(':root');
    expect(root).toMatch(/--glass-filter:\s*blur\(var\(--glass-blur\)\)\s*saturate\(var\(--glass-saturate\)\)/);
    expect(root).toMatch(/--glass-filter-light:\s*blur\(calc\(var\(--glass-blur\) \* 0\.75\)\)/);
    const radius = Number(token(':root', '--glass-blur').replace('px', ''));
    expect(radius).toBeGreaterThanOrEqual(8);
    expect(radius).toBeLessThanOrEqual(12);
    expect(Number(token(':root', '--glass-saturate').replace('%', ''))).toBeLessThanOrEqual(150);
  });

  it('as superfícies de vidro só leem a variável: nenhuma regra fixa blur(...) nem declara backdrop-filter: none', () => {
    const components = css.slice(css.indexOf('@layer components'));
    for (const declaration of components.match(/backdrop-filter:[^;]+;/g) ?? []) {
      expect(declaration).toMatch(/var\(--glass-filter(-light|-scrim)?\)/);
    }
    expect(components).not.toMatch(/backdrop-filter:\s*(blur|none)/);
    // nada de bloco de mídia dentro da camada reescrevendo a propriedade: os fallbacks mudam só variáveis
    expect(components).not.toContain('@media (prefers-reduced-transparency');
    expect(components).not.toContain('@media (prefers-contrast');
  });

  it('o vidro comum e o forte, as barras e os avisos desfocam pela variável; o véu do painel também', () => {
    expect(css).toMatch(/\.gef-glass \{[^}]*backdrop-filter: var\(--glass-filter-light\)/);
    expect(css).toMatch(/\.gef-glass-strong,\s*\.gef-sidenav,\s*\.gef-topbar,\s*\.gef-toast \{[^}]*backdrop-filter: var\(--glass-filter\)/);
    expect(css).toMatch(/\.gef-sheet-backdrop \{[^}]*backdrop-filter: var\(--glass-filter-scrim\)/);
  });

  it('cabeçalho do app móvel e cartões continuam sem desfoque; a ilha lê o fundo da variável e leva o desfoque no styles.css do app', () => {
    const header = css.match(/\.gef-app-header\s*\{[^}]*\}/)?.[0] ?? '';
    const island = css.match(/\.gef-tabbar\s*\{[^}]*\}/)?.[0] ?? '';
    const card = css.match(/\n {2}\.gef-card \{[^}]*\}/)?.[0] ?? '';
    expect(header).toContain('background-color: var(--glass-bg-strong)');
    expect(header).not.toContain('backdrop-filter');
    expect(card).not.toContain('backdrop-filter');
    expect(island).toContain('background-color: var(--glass-nav-bg)');
    expect(island).not.toContain('backdrop-filter');
    const components = css.slice(css.indexOf('@layer components'));
    const blurSelectors = [...components.matchAll(/([^{}]+)\{([^{}]*backdrop-filter[^{}]*)\}/g)].map((match) => match[1]);
    expect(blurSelectors.length).toBeGreaterThan(0);
    for (const selectors of blurSelectors) {
      expect(selectors).not.toMatch(/gef-app-header|gef-tabbar|gef-card|gef-sheet(?![-\w])|gef-quick-actions/);
    }
  });

  it('a ilha é mais opaca que o vidro comum mesmo desfocada, e o fundo sólido é ainda mais opaco', () => {
    for (const scope of [':root', "html[data-theme='light']"]) {
      const alpha = pick(scope, '--glass-nav-bg')[3];
      expect(alpha).toBeGreaterThan(0.6);
      expect(alpha).toBeLessThan(0.9);
      expect(pick(scope, '--glass-nav-bg-solid')[3]).toBeGreaterThan(alpha);
    }
  });

  it('o botão flutuante mantém alfa alto: translúcido o bastante para desfocar, opaco o bastante para o AA', () => {
    for (const scope of [':root', "html[data-theme='light']"]) {
      for (const end of ['--glass-fab-start', '--glass-fab-end']) {
        const alpha = pick(scope, end)[3];
        expect(alpha).toBeGreaterThanOrEqual(0.8);
        expect(alpha).toBeLessThan(0.95);
        expect(pick(scope, `${end}-solid`)[3]).toBeGreaterThan(alpha);
      }
    }
  });

  it('os três fallbacks do sistema desligam o desfoque trocando só variáveis e voltam a ser sólidos', () => {
    for (const marker of FALLBACKS) {
      const body = fallbackBlock(marker);
      expect(body).toContain('--glass-filter: none');
      expect(body).toContain('--glass-filter-light: none');
      expect(body).toContain('--glass-filter-scrim: none');
      expect(body).toContain('--glass-nav-bg: var(--color-gefinc-surface)');
      expect(body).toContain('--glass-nav-bg-solid: var(--color-gefinc-surface)');
      expect(body).not.toMatch(/^\s*(-webkit-)?backdrop-filter:/m);
      for (const name of ['--glass-fab-start', '--glass-fab-end', '--glass-fab-start-solid', '--glass-fab-end-solid']) {
        expect(body).toMatch(new RegExp(`${name}:\\s*rgb\\(\\d+ \\d+ \\d+\\);`));
      }
    }
  });

  it('o modo sólido (data-glass=flat) vem por último, sem camada, depois do tema claro e dos três fallbacks', () => {
    const flat = css.indexOf("html[data-glass='flat'] {");
    expect(flat).toBeGreaterThan(-1);
    for (const marker of ["html[data-theme='light'] {", ...FALLBACKS]) {
      expect(flat).toBeGreaterThan(css.indexOf(marker));
    }
    expect(flat).toBeLessThan(css.indexOf('@layer components'));
  });

  it('o modo sólido desliga todos os filtros e usa os fundos sólidos, sem hex solto e sem tocar na propriedade', () => {
    const body = block("html[data-glass='flat']");
    for (const name of ['--glass-filter', '--glass-filter-light', '--glass-filter-scrim']) {
      expect(body).toContain(`${name}: none`);
    }
    expect(body).toContain('--glass-bg-strong: var(--color-gefinc-surface)');
    expect(body).toContain('--glass-nav-bg: var(--glass-nav-bg-solid)');
    expect(body).toContain('--glass-fab-start: var(--glass-fab-start-solid)');
    expect(body).toContain('--glass-fab-end: var(--glass-fab-end-solid)');
    expect(body).not.toMatch(/^\s*(-webkit-)?backdrop-filter:/m);
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('os fundos sólidos (modo sólido) são totalmente opacos nos dois temas: nada do conteúdo aparece por trás', () => {
    for (const scope of [':root', "html[data-theme='light']"]) {
      for (const name of ['--glass-nav-bg-solid', '--glass-fab-start-solid', '--glass-fab-end-solid']) {
        expect(pick(scope, name)[3]).toBe(1);
      }
    }
  });

  it('o modo sólido deixa opacos a ilha, o botão flutuante, o cabeçalho e o vidro forte (alfa 1 nas variáveis que eles leem)', () => {
    const flat = block("html[data-glass='flat']");
    expect(flat).toContain('--glass-bg-strong: var(--color-gefinc-surface)');
    expect(flat).toContain('--glass-nav-bg: var(--glass-nav-bg-solid)');
    expect(flat).toContain('--glass-fab-start: var(--glass-fab-start-solid)');
    expect(flat).toContain('--glass-fab-end: var(--glass-fab-end-solid)');
    for (const scope of [':root', "html[data-theme='light']"]) {
      expect(themeColor(scope, '--color-gefinc-surface')[3]).toBe(1);
    }
  });

  it('o vidro é discreto: sem luzes e reflexos no botão flutuante nem brilho forte na ilha', () => {
    const fab = (name: string, scope: string) => pick(scope, name)[3];
    for (const scope of [':root', "html[data-theme='light']"]) {
      expect(fab('--glass-fab-sheen', scope)).toBeLessThanOrEqual(0.1);
      expect(fab('--glass-fab-rim', scope)).toBeLessThanOrEqual(0.25);
      expect(fab('--glass-highlight', scope)).toBeLessThanOrEqual(0.35);
      expect(fab('--glass-indicator-sheen', scope)).toBeLessThanOrEqual(0.25);
    }
    expect(fab('--glass-fab-border', ':root')).toBeLessThanOrEqual(0.2);
    expect(fab('--glass-fab-border', "html[data-theme='light']")).toBeLessThanOrEqual(0.35);
    // o indicador ativo continua distinto: tinta própria mantida
    for (const scope of [':root', "html[data-theme='light']"]) {
      expect(fab('--glass-indicator-tint', scope)).toBeGreaterThanOrEqual(0.14);
    }
  });

  it('não há pausa do desfoque na rolagem: nada no tema lê data-scrolling', () => {
    expect(css).not.toContain('data-scrolling');
  });

  describe.each(scopes)('tema %s', (_label, scope) => {
    const bg = themeColor(scope, '--color-gefinc-bg');
    const text = themeColor(scope, '--color-gefinc-text');
    const strong = over(pick(scope, '--glass-nav-bg'), bg);
    const solid = over(pick(scope, '--glass-nav-bg-solid'), bg);
    /** Pior caso com desfoque: o fundo desfocado atrás da ilha é a mistura de 50% do fundo e do texto do tema. */
    const blurred = bg.map((value, i) => (value + text[i]) / 2).concat(1) as Rgba;
    const glassNav = over(pick(scope, '--glass-nav-bg'), blurred);

    it('o rótulo ativo (cor de marca) é legível sobre o indicador de vidro, no pior ponto do brilho', () => {
      const primary = themeColor(scope, '--color-gefinc-primary');
      for (const base of [strong, solid]) {
        const tint = over(pick(scope, '--glass-indicator-tint'), base);
        const worst = over(pick(scope, '--glass-indicator-sheen'), tint);
        expect(contrast(primary, tint)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(primary, worst)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('com desfoque, no pior caso (fundo médio atrás), o rótulo comum e o ativo passam em AA sobre a ilha', () => {
      const muted = themeColor(scope, '--color-gefinc-muted');
      const primary = themeColor(scope, '--color-gefinc-primary');
      expect(contrast(muted, glassNav)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(primary, glassNav)).toBeGreaterThanOrEqual(4.5);
    });

    it('com desfoque, o rótulo ativo também passa sobre o indicador (tinta e brilho) no pior caso', () => {
      const primary = themeColor(scope, '--color-gefinc-primary');
      const tint = over(pick(scope, '--glass-indicator-tint'), glassNav);
      const worst = over(pick(scope, '--glass-indicator-sheen'), tint);
      expect(contrast(primary, tint)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(primary, worst)).toBeGreaterThanOrEqual(4.5);
    });

    it('o rótulo comum passa em AA sobre a ilha sólida (modo sólido)', () => {
      expect(contrast(themeColor(scope, '--color-gefinc-muted'), solid)).toBeGreaterThanOrEqual(4.5);
    });

    it('o texto escuro do botão flutuante passa em AA nas duas pontas (com desfoque e sólido), sobre o fundo mais escuro, o mais claro e o do tema', () => {
      const onAccent = themeColor(scope, '--color-gefinc-on-accent');
      const darkest = parseColor('#090d16');
      const lightest = parseColor('#f3f6fb');
      for (const underlay of [darkest, lightest, bg]) {
        for (const end of ['--glass-fab-start', '--glass-fab-end', '--glass-fab-start-solid', '--glass-fab-end-solid']) {
          const ratio = contrast(onAccent, over(pick(scope, end), underlay));
          if (ratio < 4.5) {
            throw new Error(`${end} sobre ${underlay.slice(0, 3).join(',')}: ${ratio.toFixed(2)}`);
          }
        }
      }
    });

    it('o texto escuro do botão flutuante passa em AA mesmo sobre o fundo médio desfocado (mistura de fundo e texto)', () => {
      const onAccent = themeColor(scope, '--color-gefinc-on-accent');
      for (const end of ['--glass-fab-start', '--glass-fab-end']) {
        expect(contrast(onAccent, over(pick(scope, end), blurred))).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});

describe('theme.css - contraste dos controles próprios (lista, calendário e paleta) nos dois temas', () => {
  /** AA para texto (1.4.3) e para marca ou elemento gráfico (1.4.11). */
  const TEXT = 4.5;
  const GRAPHIC = 3;
  /** Componente inativo é isento de AA; este piso só impede que o texto deixe de ser legível. */
  const INACTIVE_FLOOR = 2.5;

  const scopes: [string, string][] = [
    ['escuro', ':root'],
    ['claro', "html[data-theme='light']"],
  ];

  const pick = (scope: string, name: string): Rgba => {
    try {
      return parseColor(token(scope, name));
    } catch {
      return parseColor(token(':root', name));
    }
  };
  const themeColor = (scope: string, name: string): Rgba => {
    try {
      return parseColor(token(scope === ':root' ? '@theme' : scope, name));
    } catch {
      return parseColor(token('@theme', name));
    }
  };

  /** Regra de componente (`@layer components`) pelo seletor exato. */
  const rule = (selector: string): string => {
    const components = css.slice(css.indexOf('@layer components'));
    const start = components.indexOf(`${selector} {`);
    if (start < 0) {
      throw new Error(`regra ${selector} ausente`);
    }
    return components.slice(start, components.indexOf('}', start));
  };
  /** Opacidade de um utilitário `prefixo-cor/NN` da regra (ex.: `bg-gefinc-primary/10` → 0,1); 1 sem barra. */
  const alphaOf = (declaration: string, utility: string): number => {
    const match = declaration.match(new RegExp(`${utility}(?:/(\\d+))?(?![\\w-])`));
    if (!match) {
      throw new Error(`${utility} ausente em: ${declaration}`);
    }
    return match[1] === undefined ? 1 : Number(match[1]) / 100;
  };
  /** Valor de um utilitário `prefixo-NN` de opacidade (ex.: `opacity-50` → 0,5). */
  const opacityOf = (declaration: string, utility: string): number => {
    const match = declaration.match(new RegExp(`${utility}-(\\d+)(?![\\w-])`));
    if (!match) {
      throw new Error(`${utility} ausente em: ${declaration}`);
    }
    return Number(match[1]) / 100;
  };
  const tint = (color: Rgba, alpha: number, base: Rgba): Rgba => over([color[0], color[1], color[2], alpha], base);

  describe.each(scopes)('tema %s', (_label, scope) => {
    const bg = themeColor(scope, '--color-gefinc-bg');
    const surface = themeColor(scope, '--color-gefinc-surface');
    const text = themeColor(scope, '--color-gefinc-text');
    const muted = themeColor(scope, '--color-gefinc-muted');
    const primary = themeColor(scope, '--color-gefinc-primary');
    const scrim = themeColor(scope, '--color-gefinc-scrim');
    const glass = over(pick(scope, '--glass-bg'), bg);

    /** Fundos onde a lista e o calendário aparecem: o painel (vidro forte) sobre a página escurecida pelo fundo do painel. */
    const sheets = [bg, surface].map((page) => over(pick(scope, '--glass-sheet-bg'), over(scrim, page)));
    /** Fundos onde a paleta aparece: a página, o cartão de vidro ou o painel. */
    const swatchGrounds = [bg, surface, glass, ...sheets];

    it('opção da lista: texto comum e texto da escolhida (cor de marca sobre o tom da marca) passam em 4,5:1', () => {
      const selected = rule(".gef-option[aria-selected='true']");
      const alpha = alphaOf(selected, 'bg-gefinc-primary');
      expect(selected).toContain('text-gefinc-primary');
      expect(alpha).toBeGreaterThan(0);
      for (const sheet of sheets) {
        expect(contrast(text, sheet)).toBeGreaterThanOrEqual(TEXT);
        expect(contrast(primary, tint(primary, alpha, sheet))).toBeGreaterThanOrEqual(TEXT);
      }
    });

    it('opção da lista: a borda da escolhida (marca de seleção) passa em 3:1 contra o painel', () => {
      expect(rule(".gef-option[aria-selected='true']")).toContain('border-gefinc-primary');
      for (const sheet of sheets) {
        expect(contrast(primary, sheet)).toBeGreaterThanOrEqual(GRAPHIC);
      }
    });

    it('opção da lista desabilitada segue legível (isenta de AA, com piso)', () => {
      const alpha = opacityOf(rule(".gef-option[aria-disabled='true']"), 'opacity');
      for (const sheet of sheets) {
        expect(contrast(over([text[0], text[1], text[2], alpha], sheet), sheet)).toBeGreaterThanOrEqual(INACTIVE_FLOOR);
      }
    });

    it('dia do calendário: número comum e de hoje (negrito e sublinhado, na cor do texto) passam em 4,5:1', () => {
      expect(rule('.gef-day')).toContain('text-gefinc-text');
      expect(rule(".gef-day[aria-current='date']")).toMatch(/font-bold[^}]*underline|underline[^}]*font-bold/);
      for (const sheet of sheets) {
        expect(contrast(text, sheet)).toBeGreaterThanOrEqual(TEXT);
      }
    });

    it('dia do calendário escolhido: texto de marca sobre o tom da marca passa em 4,5:1 e a borda em 3:1', () => {
      const selected = rule("[role='gridcell'][aria-selected='true'] > .gef-day");
      const alpha = alphaOf(selected, 'bg-gefinc-primary');
      expect(selected).toContain('text-gefinc-primary');
      expect(selected).toContain('border-gefinc-primary');
      for (const sheet of sheets) {
        expect(contrast(primary, tint(primary, alpha, sheet))).toBeGreaterThanOrEqual(TEXT);
        expect(contrast(primary, sheet)).toBeGreaterThanOrEqual(GRAPHIC);
      }
    });

    it('dia do calendário fora do período (desabilitado) segue legível (isento de AA, com piso)', () => {
      const alpha = opacityOf(rule('.gef-day'), 'disabled:opacity');
      for (const sheet of sheets) {
        expect(contrast(over([text[0], text[1], text[2], alpha], sheet), sheet)).toBeGreaterThanOrEqual(INACTIVE_FLOOR);
      }
    });

    it('cor da paleta: a borda comum (muted) passa em 3:1 contra a página, o cartão e o painel', () => {
      expect(rule('.gef-swatch')).toContain('border-gefinc-muted');
      for (const ground of swatchGrounds) {
        expect(contrast(muted, ground)).toBeGreaterThanOrEqual(GRAPHIC);
      }
    });

    it('cor da paleta escolhida: a borda dupla na cor do texto passa em 3:1 e o anel separa com a cor do fundo', () => {
      const selected = css.slice(css.indexOf(".gef-swatch[aria-checked='true'] {"));
      const body = selected.slice(0, selected.indexOf('}'));
      expect(body).toContain('border-2');
      expect(body).toContain('border-gefinc-text');
      expect(body).toContain('var(--color-gefinc-bg)');
      for (const ground of swatchGrounds) {
        expect(contrast(text, ground)).toBeGreaterThanOrEqual(GRAPHIC);
      }
    });
  });
});

describe('theme.css - painel (.gef-sheet) opaco e véu forte, sem texto da página aparecendo através', () => {
  const scopes: [string, string][] = [
    ['escuro', ':root'],
    ['claro', "html[data-theme='light']"],
  ];
  const FALLBACKS = ['@media (prefers-reduced-transparency: reduce) {', '@media (prefers-contrast: more) {', '@supports not ('];
  const pick = (scope: string, name: string): Rgba => {
    try {
      return parseColor(token(scope, name));
    } catch {
      return parseColor(token(':root', name));
    }
  };
  const themeColor = (scope: string, name: string): Rgba => {
    try {
      return parseColor(token(scope === ':root' ? '@theme' : scope, name));
    } catch {
      return parseColor(token('@theme', name));
    }
  };

  it('o fundo do painel é quase opaco (alfa mínimo de 0,96) nos dois temas', () => {
    for (const [, scope] of scopes) {
      expect(pick(scope, '--glass-sheet-bg')[3]).toBeGreaterThanOrEqual(0.96);
    }
  });

  it('o vidro forte compartilhado (barras, avisos) não é alterado: continua translúcido', () => {
    expect(pick(':root', '--glass-bg-strong')[3]).toBe(0.74);
    expect(pick("html[data-theme='light']", '--glass-bg-strong')[3]).toBe(0.8);
  });

  it('o painel lê o fundo e a borda das variáveis próprias e continua sem nenhum filtro', () => {
    const sheet = css.match(/\n {2}\.gef-sheet \{[^}]*\}/)?.[0] ?? '';
    expect(sheet).toContain('background-color: var(--glass-sheet-bg)');
    expect(sheet).toContain('border-color: var(--glass-sheet-border)');
    expect(sheet).not.toMatch(/(backdrop-filter|\bfilter|transform):/);
    expect(css).toMatch(/\.gef-sheet-backdrop \{[^}]*backdrop-filter: var\(--glass-filter-scrim\)/);
    expect(token(':root', '--glass-filter-scrim')).toBe('blur(6px)');
  });

  it('o véu é forte: alfa mínimo de 0,7 no tema escuro e de 0,5 no claro', () => {
    expect(themeColor(':root', '--color-gefinc-scrim')[3]).toBeGreaterThanOrEqual(0.7);
    expect(themeColor("html[data-theme='light']", '--color-gefinc-scrim')[3]).toBeGreaterThanOrEqual(0.5);
  });

  it('os três fallbacks do sistema e o modo sólido deixam o painel sólido pela variável', () => {
    for (const marker of FALLBACKS) {
      const start = css.indexOf(marker);
      expect(css.slice(start, css.indexOf('\n}', start))).toContain('--glass-sheet-bg: var(--color-gefinc-surface)');
    }
    expect(block("html[data-glass='flat']")).toContain('--glass-sheet-bg: var(--color-gefinc-surface)');
  });

  it('com contraste alto o painel ganha borda forte e o véu fica mais escuro', () => {
    const start = css.indexOf('@media (prefers-contrast: more) {');
    const body = css.slice(start, css.indexOf('\n}', start));
    expect(body).toContain('--glass-sheet-border: var(--color-gefinc-muted)');
    expect(body).toMatch(/--color-gefinc-scrim:\s*rgb\(0 0 0 \/ 0\.85\)/);
  });

  it('campos dentro do painel usam o token de borda de campo, sem rebaixar a especificidade dos estados', () => {
    expect(css).toMatch(/:where\(\.gef-sheet\) \.gef-input,\s*:where\(\.gef-sheet\) \.gef-money-field \{[^}]*border-color: var\(--color-gefinc-field-border\)/);
    expect(css).toMatch(/:where\(\.gef-sheet\) \.gef-btn-secondary,[^{]*:where\(\.gef-sheet\) \.gef-seg-track \{[^}]*border-color: var\(--color-gefinc-field-border\)/);
    // as variantes de marca e perigo dos botões compactos vêm depois e vencem a borda de campo
    expect(css.indexOf(':where(.gef-sheet) .gef-btn-sm')).toBeLessThan(css.indexOf('.gef-btn-sm-primary {'));
  });

  describe.each(scopes)('tema %s', (_label, scope) => {
    const bg = themeColor(scope, '--color-gefinc-bg');
    const surface = themeColor(scope, '--color-gefinc-surface');
    const scrim = themeColor(scope, '--color-gefinc-scrim');
    const pages = [bg, surface];
    const sheets = pages.map((page) => over(pick(scope, '--glass-sheet-bg'), over(scrim, page)));

    it('a borda de campo passa em 3:1 contra a superfície, o fundo e o painel (WCAG 1.4.11)', () => {
      const border = themeColor(scope, '--color-gefinc-field-border');
      for (const ground of [bg, surface, ...sheets]) {
        expect(contrast(border, ground)).toBeGreaterThanOrEqual(3);
      }
    });

    it.each(['text', 'muted', 'primary', 'secondary', 'danger', 'warning'])('texto %s sobre o painel (com o véu e a página atrás) passa em 4,5:1', (name) => {
      const fg = themeColor(scope, `--color-gefinc-${name}`);
      for (const sheet of sheets) {
        expect(contrast(fg, sheet)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('texto de marca sobre o tom translúcido da própria cor dentro do painel passa em 4,5:1', () => {
      for (const [name, alpha] of [['primary', 0.1], ['danger', 0.1], ['warning', 0.1]] as const) {
        const fg = themeColor(scope, `--color-gefinc-${name}`);
        for (const sheet of sheets) {
          expect(contrast(fg, over([fg[0], fg[1], fg[2], alpha], sheet))).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it('o pior caso do texto da página atrás (cor do texto) não atravessa o painel: a mistura muda menos de 3% da luminância', () => {
      const text = themeColor(scope, '--color-gefinc-text');
      const sheetBg = pick(scope, '--glass-sheet-bg');
      const behind = over(scrim, text);
      const withText = over(sheetBg, behind);
      const withoutText = over(sheetBg, over(scrim, bg));
      expect(Math.abs(luminance(withText) - luminance(withoutText))).toBeLessThan(0.03);
    });
  });

  it('os novos tokens de tipografia e de borda de campo existem no @theme', () => {
    const theme = block('@theme');
    expect(theme).toContain('--text-title-sm: 1rem');
    expect(theme).toContain('--text-title-sm--line-height: 1.5rem');
    expect(theme).toContain('--color-gefinc-field-border: #64748b');
  });
});

describe('theme.css - segmentos, gaveta e menu lateral (2ª rodada)', () => {
  const rule = (selector: string, source = css): string => {
    const start = source.indexOf(`${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf('}', start));
  };

  it('o segmento tem respiro vertical (py-2) além do alvo de 44 px', () => {
    expect(rule('.gef-segment')).toContain('py-2');
  });

  it('só a região .gef-sidenav-scroll rola; o nav não tem overflow próprio', () => {
    const scroll = rule('.gef-sidenav-scroll', webCss);
    expect(scroll).toContain('overflow-y-auto');
    expect(scroll).toContain('overflow-x-hidden');
    expect(scroll).toContain('min-h-0');
    expect(rule('.gef-sidenav-nav', webCss)).not.toContain('overflow');
  });

  it('a gaveta lateral é uma coluna sem rolagem própria; cabeçalho e rodapé não encolhem', () => {
    const left = rule('.gef-sheet-left');
    expect(left).toContain('flex-col');
    expect(left).toContain('overflow-hidden');
    expect(rule('.gef-sidenav-footer', webCss)).toContain('shrink-0');
    expect(rule('.gef-sidenav-head', webCss)).toContain('shrink-0');
  });

  it('o menu lateral fica acima do conteúdo (z-40) e abaixo da gaveta e do aviso', () => {
    expect(rule('.gef-sidenav', webCss)).toContain('z-40');
  });

  it('a dica do menu recolhido é fixed, fora da rolagem, e usa a altura do item (--gef-tip-y)', () => {
    const start = webCss.indexOf(".gef-sidenav[data-collapsed='true'] .gef-nav-link:focus-visible::after {");
    expect(start).toBeGreaterThan(-1);
    const tip = webCss.slice(start, webCss.indexOf('}', start));
    expect(tip).toContain('fixed');
    expect(tip).not.toContain('absolute');
    expect(tip).not.toContain('left-full');
    expect(tip).toContain('var(--gef-tip-y');
    expect(tip).toContain('left-20');
  });

  it('a dica parte da origem da janela: o menu é sticky top-0, colado à esquerda, sem outro top-, left- nem translação', () => {
    const sidenav = rule('.gef-sidenav', webCss);
    expect(sidenav).toContain('sticky');
    expect(sidenav).toContain('top-0');
    expect(sidenav.match(/(^|\s)-?top-[^\s;]+/g)).toEqual([' top-0']);
    expect(sidenav).not.toMatch(/(^|\s)-?left-/);
    expect(sidenav).not.toMatch(/translate|transform/);
    expect(sidenav).toContain('h-screen');
    expect(rule(".gef-sidenav[data-collapsed='true']", webCss)).toContain('w-[4.5rem]');
  });

  it('a premissa da dica está documentada no CSS (fixed relativo à janela; origem 0,0)', () => {
    expect(webCss).toContain('Premissa da posição');
  });

  it('o tom de perigo do segmento vem depois da regra de marcado e usa borda, fundo e texto de perigo', () => {
    const danger = rule(".gef-segment[data-tone='danger']:has(input:checked)");
    expect(danger).toContain('border-gefinc-danger');
    expect(danger).toContain('bg-gefinc-danger/10');
    expect(danger).toContain('text-gefinc-danger');
    expect(css.indexOf(".gef-segment[data-tone='danger']:has(input:checked)")).toBeGreaterThan(css.indexOf('.gef-segment:has(input:checked) {'));
  });
});

describe('theme.css - alvo de 44 px em todas as larguras (3ª rodada)', () => {
  const rule = (selector: string, source = css): string => {
    const start = source.indexOf(`${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf('}', start));
  };
  const components = css.slice(css.indexOf('@layer components')) + webCss;

  it('nenhum componente reduz o alvo no desktop: sem md:min-h-/md:min-w-, salvo o md:min-h-20 do campo de valor grande', () => {
    const reductions = (components.match(/md:min-[hw]-[^\s;]+/g) ?? []).filter((token) => token !== 'md:min-h-20');
    expect(reductions).toEqual([]);
  });

  it.each([
    '.gef-input',
    '.gef-money-field',
    '.gef-btn-primary',
    '.gef-btn-danger',
    '.gef-btn-secondary',
    '.gef-icon-btn',
    '.gef-btn-sm',
    '.gef-seg-btn',
    '.gef-switch-row',
    '.gef-segment',
    '.gef-nav-link',
    '.gef-account-chip',
    '.gef-action',
  ])('%s tem min-h-11', (selector) => {
    expect(rule(selector, selector === '.gef-nav-link' ? webCss : css)).toContain('min-h-11');
  });

  it('o botão de ícone e a ação também têm min-w-11, e o botão de recolher o menu é h-11 w-11', () => {
    expect(rule('.gef-icon-btn')).toContain('min-w-11');
    expect(rule('.gef-action')).toContain('min-w-11');
    const toggle = rule('.gef-sidenav-toggle', webCss);
    expect(toggle).toContain('h-11');
    expect(toggle).toContain('w-11');
    expect(toggle).toContain('shrink-0'); // numa barra apertada (360 px) o botão não pode encolher abaixo de 44 px
    expect(toggle).not.toMatch(/\bh-9\b|\bw-9\b/);
  });

  it('célula de tabela com botão compacto usa py-2 (linha segue com 60 px); linhas só de texto ficam com py-3', () => {
    const start = webCss.indexOf('.gef-table td:has(');
    expect(start).toBeGreaterThan(-1);
    expect(webCss.slice(start, webCss.indexOf('}', start))).toContain('py-2');
    expect(rule('.gef-table td', webCss)).toBeDefined();
  });

  it('link solto ou de célula ganha área de toque de 44 px por pseudo-elemento, sem aumentar a linha', () => {
    expect(css).toMatch(/\.gef-hit-area::after \{[^}]*inset: -0\.75rem -0\.25rem/);
    expect(css).toMatch(/\.gef-hit-area \{\s*@apply relative/);
    expect(webCss).toMatch(/\.gef-table td a:not\([^)]*\)::after \{[^}]*inset: -0\.75rem -0\.25rem/);
    expect(webCss).toMatch(/\.gef-table td a:not\([^)]*\) \{\s*@apply relative/);
  });
});

describe('theme.css - cabeçalho e rodapé fixos do painel (3ª rodada)', () => {
  const rule = (selector: string): string => {
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf('}', start));
  };

  it('o painel guarda o respiro inferior numa variável e ajusta a rolagem para não esconder o foco atrás do cabeçalho/rodapé', () => {
    const sheet = css.match(/\n {2}\.gef-sheet \{[^}]*\}/)?.[0] ?? '';
    expect(sheet).toContain('--gef-sheet-pb: 1rem');
    expect(sheet).toContain('scroll-padding-block: 4rem 5.5rem');
    expect(sheet).toContain('padding-bottom: var(--gef-sheet-pb)');
    expect(sheet).not.toMatch(/(backdrop-filter|\bfilter|transform):/);
  });

  it('no celular a barra de gestos entra pela variável (o painel de baixo mantém o rodapé colado)', () => {
    const start = css.indexOf('.gef-sheet-backdrop:not(.gef-sheet-backdrop-left) .gef-sheet {');
    expect(start).toBeGreaterThan(-1);
    const mobile = css.slice(start, css.indexOf('}', start));
    expect(mobile).toContain('--gef-sheet-pb: calc(env(safe-area-inset-bottom) + 1rem)');
    expect(mobile).not.toMatch(/\n\s+padding-bottom:/);
  });

  it('o cabeçalho do painel é sticky, com o fundo do painel, e nunca recebe filtro, desfoque nem transformação', () => {
    const head = rule('.gef-sheet-head');
    expect(head).toContain('position: sticky');
    expect(head).toContain('top: -1rem'); // o sticky conta da borda interna do respiro (1rem): negativo para colar na borda
    expect(head).toContain('background-color: var(--glass-sheet-bg)');
    expect(head).not.toMatch(/(backdrop-filter|\bfilter|transform)\b/);
  });

  it('o formulário em cartão (group-form) perde respiro, borda, sombra e fundo dentro do painel, para o rodapé fixo colar na borda', () => {
    const base = css.indexOf('.gef-form-card {');
    const inSheet = css.indexOf('.gef-sheet .gef-form-card {');
    expect(base).toBeGreaterThan(-1);
    expect(inSheet).toBeGreaterThan(base);
    const rule = css.slice(inSheet, css.indexOf('}', inSheet));
    for (const declaration of ['padding: 0', 'border-width: 0', 'box-shadow: none', 'background-color: transparent']) {
      expect(rule).toContain(declaration);
    }
    expect(inSheet).toBeGreaterThan(css.indexOf('.gef-card {\n    @apply rounded-xl'));
  });

  it('as ações do painel são sticky no fim, só dentro de .gef-sheet (seletor descendente), e sem filtro nem transformação', () => {
    const actions = rule('.gef-sheet .gef-sheet-actions');
    expect(actions).toContain('position: sticky');
    expect(actions).toContain('bottom: calc(-1 * var(--gef-sheet-pb))');
    expect(actions).toContain('padding: 0.75rem 1rem var(--gef-sheet-pb)');
    expect(actions).toContain('background-color: var(--glass-sheet-bg)');
    expect(actions).toContain('border-top: 1px solid var(--glass-sheet-border)');
    expect(actions).not.toMatch(/(backdrop-filter|\bfilter|transform)\b/);
    expect(css).not.toMatch(/\n {2}\.gef-sheet-actions \{/);
  });
});

describe('theme.css / web.css - CSS só do web fora do pacote do celular (3ª rodada)', () => {
  it('web.css é importado só pelo app web, depois do theme.css; o app móvel não o importa', () => {
    expect(webStyles).toContain("styles/web.css';");
    expect(webStyles.indexOf('styles/web.css')).toBeGreaterThan(webStyles.indexOf('styles/theme.css'));
    expect(mobileStyles).not.toContain('web.css');
  });

  it('o theme.css (compartilhado com o celular) não tem mais o menu lateral, a barra do topo, as dicas nem a tabela', () => {
    const selectors = ['.gef-sidenav-scroll {', '.gef-sidenav-head {', '.gef-sidenav-toggle {', '.gef-nav-link {', '.gef-nav-active {', '.gef-nav-group-title {', '.gef-topbar {', '.gef-table {', '.gef-table-wrap {'];
    for (const selector of selectors) {
      expect(css).not.toContain(`\n  ${selector}`);
      expect(webCss).toContain(`\n  ${selector}`);
    }
  });

  it('a moldura da tabela é relative: o texto só-leitor-de-tela (sr-only, absoluto) fica contido no recorte e não alarga a página', () => {
    const start = webCss.indexOf('.gef-table-wrap {');
    expect(start).toBeGreaterThan(-1);
    const wrap = webCss.slice(start, webCss.indexOf('}', start));
    expect(wrap).toContain('relative');
    expect(wrap).toContain('overflow-x-auto');
  });

  it('as listas de vidro continuam no theme.css (o desfoque do menu e da barra vem das variáveis)', () => {
    expect(css).toMatch(/\.gef-glass-strong,\s*\.gef-sidenav,\s*\.gef-topbar,\s*\.gef-toast \{/);
  });

  it('o web.css segue as mesmas regras do theme.css: sem hex solto, sem desfoque fixo, sem filtro no menu', () => {
    expect(webCss).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(webCss).not.toContain('bg-black');
    for (const declaration of webCss.match(/backdrop-filter:[^;]+;/g) ?? []) {
      expect(declaration).toMatch(/var\(--glass-filter(-light|-scrim)?\)/);
    }
    expect(webCss).not.toMatch(/backdrop-filter:\s*(blur|none)/);
    expect(webCss).not.toMatch(/(^|[\s;{])(filter|backdrop-filter):/);
    expect(webCss).not.toMatch(/\bdark:/);
  });
});
