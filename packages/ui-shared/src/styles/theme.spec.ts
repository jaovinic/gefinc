import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, 'theme.css'), 'utf8');

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

  it('cabeçalho e ilha do app móvel não desfocam (desempenho a 120 Hz): a ilha usa um vidro mais opaco', () => {
    const header = css.match(/\.gef-app-header\s*\{[^}]*\}/)?.[0] ?? '';
    const island = css.match(/\.gef-tabbar\s*\{[^}]*\}/)?.[0] ?? '';
    expect(header).toContain('background-color: var(--glass-bg-strong)');
    expect(header).not.toContain('backdrop-filter');
    expect(island).toContain('background-color: var(--glass-nav-bg)');
    expect(island).not.toContain('backdrop-filter');
    const blurGroup = css.match(/\.gef-glass-strong,[^{]*\{[^}]*\}/)?.[0] ?? '';
    expect(blurGroup).not.toContain('.gef-app-header');
    expect(blurGroup).not.toContain('.gef-tabbar');
  });

  it('a ilha é mais opaca que o vidro comum e volta a ser sólida nos três fallbacks', () => {
    for (const scope of [':root', "html[data-theme='light']"]) {
      expect(parseColor(token(scope, '--glass-nav-bg'))[3]).toBeGreaterThan(parseColor(token(scope, '--glass-bg-strong'))[3]);
    }
    for (const marker of ['@media (prefers-reduced-transparency: reduce) {', '@media (prefers-contrast: more) {', '@supports not (']) {
      const start = css.indexOf(marker);
      expect(css.slice(start, css.indexOf('\n}', start))).toContain('--glass-nav-bg: var(--color-gefinc-surface)');
    }
  });

  describe.each(scopes)('tema %s', (_label, scope) => {
    const bg = themeColor(scope, '--color-gefinc-bg');
    const strong = over(pick(scope, '--glass-nav-bg'), bg);

    it('o rótulo ativo (cor de marca) é legível sobre o indicador de vidro, no pior ponto do brilho', () => {
      const primary = themeColor(scope, '--color-gefinc-primary');
      const tint = over(pick(scope, '--glass-indicator-tint'), strong);
      const worst = over(pick(scope, '--glass-indicator-sheen'), tint);
      expect(contrast(primary, tint)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(primary, worst)).toBeGreaterThanOrEqual(4.5);
    });

    it('o texto escuro do botão flutuante passa em AA nas duas pontas, mesmo sobre o fundo mais escuro e o mais claro', () => {
      const onAccent = themeColor(scope, '--color-gefinc-on-accent');
      const darkest = parseColor('#090d16');
      const lightest = parseColor('#f3f6fb');
      for (const underlay of [darkest, lightest, bg]) {
        for (const end of ['--glass-fab-start', '--glass-fab-end']) {
          const ratio = contrast(onAccent, over(pick(scope, end), underlay));
          if (ratio < 4.5) {
            throw new Error(`${end} sobre ${underlay.slice(0, 3).join(',')}: ${ratio.toFixed(2)}`);
          }
        }
      }
    });
  });
});
