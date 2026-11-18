import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Trava da regra "toda data e hora do sistema é um controle próprio": nenhum código de apps/ ou packages/ pode
 * reintroduzir o seletor do navegador ou do Android (type="date", "datetime-local", "month", "week", "time", tipo
 * dinâmico por [type], [attr.type], interpolação ou ternário, objetos de configuração `{ type: 'date' }`, showPicker,
 * valueAsDate, ion-datetime, matDatepicker ou o indicador do calendário do WebKit). Também varre tools/.
 * Os specs ficam de fora porque eles mesmos afirmam a ausência desses controles.
 */
const ROOT = join(__dirname, '../../../../..');
const SCAN_ROOTS = ['apps', 'packages', 'tools'];
const EXTENSIONS = /\.(ts|html|css|cjs|mjs|js)$/;
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'build', '.angular', '.nx', 'android', 'ios', 'www', 'coverage', 'out-tsc']);

const KINDS = '(date|datetime-local|month|week|time)';

const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: 'type="date|datetime-local|month|week|time"', pattern: new RegExp(`type\\s*=\\s*["']?${KINDS}\\b`, 'i') },
  { name: 'tipo dinâmico ([type] / [attr.type], com interpolação ou ternário)', pattern: /\[(attr\.)?type\]\s*=/ },
  { name: 'tipo por interpolação (type="{{ ... }}")', pattern: /\btype\s*=\s*["']?\{\{/ },
  { name: 'objeto de campo { type: "date|datetime-local|month|week|time" }', pattern: new RegExp(`["']?\\btype["']?\\s*:\\s*["']${KINDS}["']`, 'i') },
  { name: 'input[type=date|month|time...] em CSS ou seletor', pattern: new RegExp(`input\\[type\\s*=\\s*["']?${KINDS}`, 'i') },
  { name: 'type = "date|month|time" por código (inclusive em ternário)', pattern: new RegExp(`\\.type\\s*=[^;=]*["']${KINDS}["']`) },
  { name: 'setAttribute("type", "date|...") (inclusive em ternário)', pattern: new RegExp(`setAttribute\\(\\s*["']type["']\\s*,[^)]*["']${KINDS}["']`) },
  { name: 'showPicker', pattern: /\bshowPicker\b/ },
  { name: 'valueAsDate', pattern: /\bvalueAsDate\b/ },
  { name: 'ion-datetime', pattern: /ion-datetime/i },
  { name: 'matDatepicker', pattern: /matDatepicker|mat-datepicker/i },
  { name: '::-webkit-calendar-picker-indicator', pattern: /calendar-picker-indicator/ },
];

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIPPED_DIRS.has(name)) {
      continue;
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, found);
    } else if (EXTENSIONS.test(name) && !/\.spec\.ts$/.test(name)) {
      found.push(path);
    }
  }
  return found;
}

function occurrences(files: string[]): string[] {
  const hits: string[] = [];
  for (const file of files) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        for (const { name, pattern } of FORBIDDEN) {
          if (pattern.test(line)) {
            hits.push(`${relative(ROOT, file)}:${index + 1} (${name})`);
          }
        }
      });
  }
  return hits;
}

describe('nenhum campo de data ou hora nativo (navegador ou Android) em apps/ e packages/', () => {
  const files = SCAN_ROOTS.flatMap((dir) => sourceFiles(join(ROOT, dir)));

  it('varre os templates e estilos dos apps web e mobile e do ui-shared', () => {
    const relativeFiles = files.map((file) => relative(ROOT, file));
    expect(files.length).toBeGreaterThan(100);
    expect(relativeFiles).toContain('packages/ui-shared/src/lib/date-field/date-field.ts');
    expect(relativeFiles).toContain('packages/ui-shared/src/styles/theme.css');
    expect(relativeFiles.some((file) => file.startsWith('apps/web-app/src/app/admin/audit/'))).toBe(true);
    expect(relativeFiles.some((file) => file.startsWith('apps/mobile-app/src/'))).toBe(true);
    expect(relativeFiles).toContain('apps/mobile-app-e2e/device/android-smoke.cjs');
    expect(relativeFiles).toContain('tools/check-prod-bundle.mjs');
  });

  it('reconhece cada forma proibida (o detector não é cego)', () => {
    const samples = [
      '<input type="date" />',
      "<input type='datetime-local' />",
      '<input type=month>',
      '<input type="time" />',
      '<input [type]="kind" />',
      '<input [attr.type]="kind" />',
      "input[type='date']::-webkit-calendar-picker-indicator",
      "el.type = 'date';",
      "el.setAttribute('type', 'time');",
      'input.showPicker();',
      'input.valueAsDate',
      '<ion-datetime></ion-datetime>',
      '<input matDatepicker />',
      // objetos de configuração de campos
      "{ key: 'when', type: 'date' }",
      '{ type: "datetime-local", label: "Quando" }',
      "const field = { 'type': 'month' };",
      'fields = [{ name: "hora", type: \'time\' }, { name: "semana", type: "week" }];',
      // tipo dinâmico: ternário, interpolação e atributo
      `<input [type]="withTime ? 'datetime-local' : 'text'" />`,
      `<input [attr.type]="isDate() ? 'date' : 'text'" />`,
      '<input type="{{ kind }}" />',
      `<input type="{{ withTime ? 'time' : 'text' }}" />`,
      "input.type = withTime ? 'datetime-local' : 'text';",
      "input.setAttribute('type', withTime ? 'time' : 'text');",
    ];
    for (const sample of samples) {
      expect(FORBIDDEN.some(({ pattern }) => pattern.test(sample))).toBe(true);
    }
    for (const allowed of ['<input type="text" inputmode="numeric" />', '<input type="number" />',
      '<gef-date-field label="Data" />',
      '<span>{{ labels[type] }}</span>',
      'const label = labels[type];',
      "{ type: 'text', label: 'Descrição' }",
      "{ type: 'number' }",
      "{ type: 'success' | 'error' }",
      "const kind: Kind = { type: 'danger' };",
      "input.type = 'text';",
      "el.setAttribute('type', 'button');",
      "if (event.type === 'time') { return; }",
      '<input type="password" autocomplete="current-password" />',
    ]) {
      expect(FORBIDDEN.some(({ pattern }) => pattern.test(allowed))).toBe(false);
    }
  });

  it('0 ocorrências nativas (lista as linhas se alguma reaparecer)', () => {
    expect(occurrences(files)).toEqual([]);
  });
});
