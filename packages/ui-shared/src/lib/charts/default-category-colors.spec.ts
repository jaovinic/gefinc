import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface DefaultCategory {
  name: string;
  color: string;
}

/**
 * Fonte de verdade compartilhada com o api-server: `DefaultCategorySeederTest` garante que o
 * `DefaultCategorySeeder` cria exatamente estas categorias. Mudar a cor aqui sem mudar o semeador (ou o
 * inverso) quebra um dos dois testes.
 */
const defaults: { expense: DefaultCategory[]; income: DefaultCategory[] } = JSON.parse(
  readFileSync(join(__dirname, '../../../../core-models/fixtures/default-categories.json'), 'utf8'),
);
const EXPENSE_DEFAULTS: Record<string, string> = Object.fromEntries(defaults.expense.map((c) => [c.name, c.color]));

/** Diferença de cor mínima (CIE76, ΔE) entre quaisquer duas cores padrão. */
const MIN_DELTA_E = 25;
/** Compras é a cor mais recente: exigimos folga maior em relação a todas as outras. */
const MIN_DELTA_E_COMPRAS = 35;
/** WCAG 1.4.11: elemento gráfico precisa de 3:1 contra o que está ao redor. */
const MIN_GRAPHIC_CONTRAST = 3;

/**
 * PENDENTE DE DECISÃO: no tema claro, estas cores padrão de despesa ficam abaixo de 3:1 contra o fundo
 * (valores medidos: Alimentação 2,59; Educação 2,30; Serviços 1,98; Outras despesas 2,37). Cada fatia
 * também é identificada pelo rótulo/legenda, mas o limite de 1.4.11 não é atingido só pela cor. O valor
 * é o piso aceito hoje (medido, arredondado para baixo): impede que piorem, sem alterar as cores.
 */
const LIGHT_THEME_EXCEPTIONS: Record<string, number> = {
  Alimentação: 2.5,
  Educação: 2.2,
  Serviços: 1.9,
  'Outras despesas': 2.3,
};

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

/** Sobrepõe uma cor translúcida (`rgb(r g b / alfa)`) a um fundo opaco. */
function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb;
}

const css = readFileSync(join(__dirname, '../../styles/theme.css'), 'utf8');
const lightBlock = css.slice(css.indexOf("html[data-theme='light'] {"), css.indexOf('/* Fundo "aurora"'));

/** Lê `--nome: valor;` do tema escuro (padrão) ou, com `light`, do bloco do tema claro (que herda o restante). */
function token(name: string, theme: 'dark' | 'light'): string {
  const pattern = new RegExp(`${name}:\\s*([^;]+);`);
  const fromLight = theme === 'light' ? pattern.exec(lightBlock)?.[1] : undefined;
  const value = fromLight ?? pattern.exec(css)?.[1];
  if (!value) throw new Error(`token ${name} não encontrado em theme.css`);
  return value.trim();
}

function glass(theme: 'dark' | 'light'): { page: Rgb; card: Rgb } {
  const page = toRgb(token('--color-gefinc-bg', theme));
  const match = /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(token('--glass-bg', theme));
  if (!match) throw new Error('--glass-bg fora do formato esperado');
  const card = over([Number(match[1]), Number(match[2]), Number(match[3])], Number(match[4]), page);
  return { page, card };
}

describe('cores padrão das categorias de despesa', () => {
  const entries = Object.entries(EXPENSE_DEFAULTS);

  it('todas as cores são hex #RRGGBB e nenhuma se repete', () => {
    const colors = entries.map(([, c]) => c);
    colors.forEach((c) => expect(c).toMatch(/^#[0-9A-F]{6}$/));
    expect(new Set(colors).size).toBe(colors.length);
  });

  it(`quaisquer duas cores padrão ficam a pelo menos ΔE ${MIN_DELTA_E} uma da outra`, () => {
    const close: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const d = deltaE(entries[i][1], entries[j][1]);
        if (d < MIN_DELTA_E) close.push(`${entries[i][0]} x ${entries[j][0]}: ${d.toFixed(1)}`);
      }
    }
    expect(close).toEqual([]);
  });

  it(`Compras (verde) fica a pelo menos ΔE ${MIN_DELTA_E_COMPRAS} de todas as outras`, () => {
    const compras = EXPENSE_DEFAULTS['Compras'];
    for (const [name, color] of entries.filter(([n]) => n !== 'Compras')) {
      expect({ name, ok: deltaE(compras, color) >= MIN_DELTA_E_COMPRAS }).toEqual({ name, ok: true });
    }
  });

  it('Compras deixou de ser lilás e não se confunde com Moradia', () => {
    expect(EXPENSE_DEFAULTS['Compras']).not.toBe('#A855F7');
    expect(deltaE(EXPENSE_DEFAULTS['Compras'], EXPENSE_DEFAULTS['Moradia'])).toBeGreaterThan(MIN_DELTA_E_COMPRAS);
  });

  describe.each(['dark', 'light'] as const)('contraste de elemento gráfico (WCAG 1.4.11) no tema %s', (theme) => {
    const surfaces = {
      'fundo da página': () => glass(theme).page,
      'superfície do tema': () => toRgb(token('--color-gefinc-surface', theme)),
      'cartão de vidro sobre o fundo (onde o gráfico fica)': () => glass(theme).card,
    };
    /** Pior contraste da cor entre as superfícies onde a fatia pode aparecer. */
    const worst = (color: string) => Math.min(...Object.values(surfaces).map((s) => contrast(toRgb(color), s())));
    const exceptions = theme === 'light' ? LIGHT_THEME_EXCEPTIONS : {};

    it.each(Object.entries(EXPENSE_DEFAULTS).filter(([name]) => !(name in exceptions)))(
      '%s tem pelo menos 3:1 contra o fundo, a superfície e o cartão de vidro',
      (name, color) => {
        expect({ name, ok: worst(color) >= MIN_GRAPHIC_CONTRAST }).toEqual({ name, ok: true });
      },
    );

    it('Compras (verde) tem pelo menos 3:1 contra cada superfície', () => {
      for (const surface of Object.values(surfaces)) {
        expect(contrast(toRgb(EXPENSE_DEFAULTS['Compras']), surface())).toBeGreaterThanOrEqual(MIN_GRAPHIC_CONTRAST);
      }
    });

    it('as exceções documentadas continuam abaixo de 3:1 mas não pioram além do piso registrado', () => {
      for (const [name, floor] of Object.entries(exceptions)) {
        const ratio = worst(EXPENSE_DEFAULTS[name]);
        // Se a cor passar a ter 3:1, a exceção está obsoleta e deve ser removida.
        expect({ name, stale: ratio >= MIN_GRAPHIC_CONTRAST }).toEqual({ name, stale: false });
        expect({ name, ok: ratio >= floor }).toEqual({ name, ok: true });
      }
    });
  });
});
