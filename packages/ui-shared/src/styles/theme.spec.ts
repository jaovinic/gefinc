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
