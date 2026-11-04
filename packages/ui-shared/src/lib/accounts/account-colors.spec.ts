import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORY_COLORS } from '../color-swatch/color-swatch';
import { markColor } from '../color-swatch/mark-color';
import { ACCOUNT_COLORS, accountColor } from './account-colors';

/**
 * Fonte de verdade da paleta, compartilhada entre os clientes: `ACCOUNT_COLORS` precisa espelhar este arquivo (o servidor
 * aceita qualquer `#RRGGBB`, a paleta é só do seletor).
 */
const fixture: { colors: { name: string; hex: string }[] } = JSON.parse(
  readFileSync(join(__dirname, '../../../../core-models/fixtures/account-colors.json'), 'utf8'),
);

/** Diferença de cor mínima (CIE76, ΔE) entre quaisquer duas cores da paleta. */
const MIN_DELTA_E = 25;
/** WCAG 1.4.11: o preenchimento (elemento gráfico) precisa de 3:1 contra o que está ao redor. */
const MIN_GRAPHIC_CONTRAST = 3;
/** WCAG 1.4.3: o ícone sobre o preenchimento tem a exigência de texto, 4,5:1. */
const MIN_ICON_CONTRAST = 4.5;

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const linear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function toLab(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb.map(linear);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = toLab(toRgb(a));
  const [l2, a2, b2] = toLab(toRgb(b));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Sobrepõe uma cor translúcida a um fundo opaco. */
function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb;
}

const css = readFileSync(join(__dirname, '../../styles/theme.css'), 'utf8');
const lightBlock = css.slice(css.indexOf("html[data-theme='light'] {"), css.indexOf('/* Fundo "aurora"'));
const contrastMoreBlock = css.slice(css.indexOf('@media (prefers-contrast: more)'), css.indexOf('@supports not'));

type Theme = 'dark' | 'light';

/** Lê `--nome: valor;` do tema escuro (padrão) ou, com `light`, do bloco do tema claro (que herda o restante). */
function token(name: string, theme: Theme, block?: string): string {
  const pattern = new RegExp(`${name}:\\s*([^;]+);`);
  const value = (block && pattern.exec(block)?.[1]) || (theme === 'light' ? pattern.exec(lightBlock)?.[1] : undefined) || pattern.exec(css)?.[1];
  if (!value) throw new Error(`token ${name} não encontrado em theme.css`);
  return value.trim();
}

/** Cor do fundo de vidro (`--glass-bg`/`--glass-bg-strong`) já sobre o fundo da página; trata o `var(--...surface)` do contraste alto. */
function glass(name: '--glass-bg' | '--glass-bg-strong', theme: Theme, block?: string): Rgb {
  const page = toRgb(token('--color-gefinc-bg', theme));
  const value = token(name, theme, block);
  if (value === 'var(--color-gefinc-surface)') {
    return toRgb(token('--color-gefinc-surface', theme));
  }
  const match = /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(value);
  if (!match) throw new Error(`${name} fora do formato esperado: ${value}`);
  return over([Number(match[1]), Number(match[2]), Number(match[3])], Number(match[4]), page);
}

/** Onde o tile de uma conta pode aparecer: página, superfícies, cartão de vidro e vidro forte, e o contraste alto (opaco). */
function surfaces(theme: Theme): Record<string, Rgb> {
  return {
    'fundo da página': toRgb(token('--color-gefinc-bg', theme)),
    'superfície do tema': toRgb(token('--color-gefinc-surface', theme)),
    'cartão de vidro': glass('--glass-bg', theme),
    'vidro forte (barras, folhas)': glass('--glass-bg-strong', theme),
    'cartão com prefers-contrast: more': glass('--glass-bg', theme, contrastMoreBlock),
  };
}

describe('paleta de cores das contas', () => {
  it('espelha o fixture compartilhado (mesmas cores, nomes e ordem)', () => {
    expect(ACCOUNT_COLORS.map((c) => ({ name: c.name, hex: c.hex }))).toEqual(fixture.colors);
  });

  it('todas as cores são #RRGGBB em maiúsculas, sem repetição, com nome', () => {
    const hexes = ACCOUNT_COLORS.map((c) => c.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
    expect(new Set(ACCOUNT_COLORS.map((c) => c.name)).size).toBe(hexes.length);
    for (const color of ACCOUNT_COLORS) {
      expect(color.hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(color.name.length).toBeGreaterThan(2);
    }
  });

  it(`quaisquer duas cores ficam a pelo menos ΔE ${MIN_DELTA_E} uma da outra`, () => {
    const close: string[] = [];
    for (let i = 0; i < ACCOUNT_COLORS.length; i++) {
      for (let j = i + 1; j < ACCOUNT_COLORS.length; j++) {
        const d = deltaE(ACCOUNT_COLORS[i].hex, ACCOUNT_COLORS[j].hex);
        if (d < MIN_DELTA_E) close.push(`${ACCOUNT_COLORS[i].name} x ${ACCOUNT_COLORS[j].name}: ${d.toFixed(1)}`);
      }
    }
    expect(close).toEqual([]);
  });

  it(`o ícone sobre o preenchimento tem pelo menos ${MIN_ICON_CONTRAST}:1 (cor escolhida por markColor)`, () => {
    for (const { name, hex } of ACCOUNT_COLORS) {
      expect({ name, ok: contrast(toRgb(hex), toRgb(markColor(hex))) >= MIN_ICON_CONTRAST }).toEqual({ name, ok: true });
    }
  });

  describe.each(['dark', 'light'] as const)('contraste do preenchimento (WCAG 1.4.11) no tema %s', (theme) => {
    it.each(ACCOUNT_COLORS.map((c) => [c.name, c.hex]))('%s tem pelo menos 3:1 contra fundo, superfície, vidro e contraste alto', (name, hex) => {
      const failing = Object.entries(surfaces(theme))
        .map(([surface, rgb]) => ({ surface, ratio: contrast(toRgb(hex), rgb) }))
        .filter((r) => r.ratio < MIN_GRAPHIC_CONTRAST)
        .map((r) => `${r.surface}: ${r.ratio.toFixed(2)}`);
      expect({ name, failing }).toEqual({ name, failing: [] });
    });
  });

  it('o tema de contraste alto usa a superfície opaca como cartão (a medição cobre esse caso)', () => {
    for (const theme of ['dark', 'light'] as const) {
      expect(surfaces(theme)['cartão com prefers-contrast: more']).toEqual(surfaces(theme)['superfície do tema']);
    }
  });

  /**
   * Cores plausíveis que foram medidas e descartadas: ficam abaixo de 3:1 (ou deixam o ícone abaixo de 4,5:1) em algum
   * tema. Se uma passar a ser aceitável (ex.: o tema mudou), o teste avisa para reavaliar a paleta.
   */
  describe('cores descartadas', () => {
    const rejected: Record<string, string> = {
      '#4F46E5': 'índigo: 2,73:1 contra a superfície escura',
      '#92400E': 'marrom: 2,42:1 contra a superfície escura',
      '#D97706': 'âmbar: 2,94:1 contra o fundo claro',
      '#65A30D': 'lima: 2,85:1 contra o fundo claro',
      '#CA8A04': 'amarelo: 2,71:1 contra o fundo claro',
      '#00E599': 'menta: 1,53:1 contra o fundo claro',
      '#94A3B8': 'cinza-ardósia: 2,37:1 contra o fundo claro',
    };

    it.each(Object.entries(rejected))('%s (%s) continua reprovada e fora da paleta', (hex) => {
      expect(ACCOUNT_COLORS.map((c) => c.hex)).not.toContain(hex);
      const worst = Math.min(...(['dark', 'light'] as const).flatMap((t) => Object.values(surfaces(t)).map((s) => contrast(toRgb(hex), s))));
      const icon = contrast(toRgb(hex), toRgb(markColor(hex)));
      expect(worst >= MIN_GRAPHIC_CONTRAST && icon >= MIN_ICON_CONTRAST).toBe(false);
    });

    it('a paleta de categorias não serve às contas: várias de suas cores reprovam', () => {
      const failing = CATEGORY_COLORS.filter((c) => {
        const worst = Math.min(...(['dark', 'light'] as const).flatMap((t) => Object.values(surfaces(t)).map((s) => contrast(toRgb(c.hex), s))));
        return worst < MIN_GRAPHIC_CONTRAST || contrast(toRgb(c.hex), toRgb(markColor(c.hex))) < MIN_ICON_CONTRAST;
      });
      expect(failing.length).toBeGreaterThanOrEqual(8);
    });
  });
});

describe('accountColor', () => {
  it('normaliza para maiúsculas e ignora ausente ou malformada', () => {
    expect(accountColor('#2563eb')).toBe('#2563EB');
    expect(accountColor('#2563EB')).toBe('#2563EB');
    expect(accountColor(undefined)).toBeNull();
    expect(accountColor(null)).toBeNull();
    expect(accountColor('')).toBeNull();
    expect(accountColor('azul')).toBeNull();
    expect(accountColor('#12345')).toBeNull();
  });
});
