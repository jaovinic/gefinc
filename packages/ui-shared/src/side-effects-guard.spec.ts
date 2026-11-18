import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Trava do `"sideEffects": false` de packages/ui-shared/package.json. Com a flag, o bundler descarta qualquer módulo
 * cujos exports não sejam usados, inclusive o código que roda ao importar. O único efeito colateral legítimo da
 * biblioteca é o `Chart.register(...)` de charts/category-donut.ts, que sobrevive porque fica no mesmo módulo do
 * componente. Se um efeito colateral novo surgir (ou o registro for separado do componente), o gráfico quebraria só em
 * produção, então este spec falha antes disso.
 */
const PACKAGE_ROOT = join(__dirname, '..');
const SRC_ROOT = __dirname;
const DONUT = join('lib', 'charts', 'category-donut.ts');

const MESSAGE = 'efeito colateral em ui-shared: liste o arquivo em sideEffects do package.json ou remova';
const CHART_MESSAGE =
  'chart.js só pode ser importado em lib/charts/category-donut.ts, junto do Chart.register: revise o registro (sideEffects: false) antes de importá-lo em outro arquivo';

/** Efeitos colaterais no nível do módulo: instruções sem indentação ou imports sem binding. */
const SIDE_EFFECTS: { name: string; pattern: RegExp; allowedIn?: string }[] = [
  { name: "import '...' sem binding", pattern: /^import\s+['"]/ },
  { name: 'registerLocaleData(', pattern: /^registerLocaleData\(/ },
  { name: 'customElements.define(', pattern: /^customElements\.define\(/ },
  { name: '.register( no nível do módulo', pattern: /^[\w$.]+\.register\(/, allowedIn: DONUT },
  { name: '@angular/localize/init', pattern: /@angular\/localize\/init/ },
];

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'testing') {
        sourceFiles(path, found);
      }
    } else if (/\.ts$/.test(name) && !/\.spec\.ts$/.test(name) && name !== 'test-setup.ts') {
      found.push(path);
    }
  }
  return found;
}

function sideEffectsIn(text: string, file: string): string[] {
  const hits: string[] = [];
  text.split('\n').forEach((line, index) => {
    for (const { name, pattern, allowedIn } of SIDE_EFFECTS) {
      if (pattern.test(line) && !(allowedIn && file.endsWith(allowedIn))) {
        hits.push(`${file}:${index + 1} (${name})`);
      }
    }
  });
  return hits;
}

function importsChartJs(text: string): boolean {
  return /(?:from|import)\s*\(?\s*['"]chart\.js(?:\/[^'"]*)?['"]/.test(text);
}

describe('sideEffects: false do ui-shared', () => {
  const files = sourceFiles(SRC_ROOT);
  const rel = (file: string) => relative(SRC_ROOT, file).split(sep).join('/');

  it('o package.json declara sideEffects (false ou lista de arquivos)', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { sideEffects?: unknown };
    expect(pkg.sideEffects === false || Array.isArray(pkg.sideEffects)).toBe(true);
  });

  it('varre os fontes da biblioteca', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.map(rel)).toContain('lib/charts/category-donut.ts');
  });

  it('Chart.register fica em category-donut.ts, no mesmo módulo do componente', () => {
    const donut = readFileSync(join(SRC_ROOT, DONUT), 'utf8');
    expect(donut).toContain('Chart.register(');
    expect(donut).toContain('export class');
  });

  it('chart.js só é importado em category-donut.ts', () => {
    const offenders = files.filter((file) => !file.endsWith(DONUT) && importsChartJs(readFileSync(file, 'utf8'))).map(rel);
    expect({ message: CHART_MESSAGE, offenders }).toEqual({ message: CHART_MESSAGE, offenders: [] });
  });

  it('nenhum efeito colateral no nível do módulo além do Chart.register', () => {
    const hits = files.flatMap((file) => sideEffectsIn(readFileSync(file, 'utf8'), rel(file)));
    expect({ message: MESSAGE, hits }).toEqual({ message: MESSAGE, hits: [] });
  });

  describe('detector', () => {
    const detect = (code: string, file = 'lib/x/x.ts') => sideEffectsIn(code, file);

    it.each([
      ["import 'zone.js';", "import '...' sem binding"],
      ['import "@angular/localize/init";', "import '...' sem binding"],
      ['registerLocaleData(localePt);', 'registerLocaleData('],
      ["customElements.define('gef-x', GefX);", 'customElements.define('],
      ['Chart.register(DoughnutController);', '.register( no nível do módulo'],
      ['  // @angular/localize/init', '@angular/localize/init'],
    ])('detecta %s', (code, name) => {
      expect(detect(code).some((hit) => hit.includes(name))).toBe(true);
    });

    it.each([
      "import { Component } from '@angular/core';",
      "export * from './lib/x';",
      'export const X = 1;',
      '    .register({ email, password })',
      '  this.registry.register(item);',
      '  registerLocaleData(localePt);',
      '// import side effect',
    ])('permite %s', (code) => {
      expect(detect(code)).toEqual([]);
    });

    it('permite o Chart.register apenas em category-donut.ts', () => {
      expect(detect('Chart.register(ArcElement);', 'lib/charts/category-donut.ts')).toEqual([]);
      expect(detect('Chart.register(ArcElement);', 'lib/charts/outro.ts')).toHaveLength(1);
    });

    it('detecta import de chart.js', () => {
      expect(importsChartJs("import { Chart } from 'chart.js';")).toBe(true);
      expect(importsChartJs("import 'chart.js/auto';")).toBe(true);
      expect(importsChartJs("const c = await import('chart.js');")).toBe(true);
      expect(importsChartJs("import { x } from './chart-slice';")).toBe(false);
    });
  });
});
