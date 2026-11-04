import type { SwatchColor } from '../color-swatch/color-swatch';

/**
 * Paleta de cores do ícone de contas e cartões, na ordem em que aparece no seletor. Espelha
 * `packages/core-models/fixtures/account-colors.json` (conferido por `account-colors.spec.ts`).
 *
 * Cada cor foi escolhida por medição: o preenchimento precisa de 3:1 contra o fundo, a superfície e o cartão de vidro
 * dos temas claro e escuro (WCAG 1.4.11) e o ícone sobre ele, de 4,5:1. Por isso a paleta não reaproveita
 * `CATEGORY_COLORS`: das 16 cores de categoria, 9 não passam (amarelo, âmbar, lima, menta, turquesa, ciano, laranja
 * claro e cinza-ardósia ficam abaixo de 3:1 no tema claro; o índigo #6366F1 deixa o ícone branco em 4,47:1).
 */
export const ACCOUNT_COLORS: readonly SwatchColor[] = [
  { name: 'Azul', hex: '#2563EB' },
  { name: 'Ciano', hex: '#0891B2' },
  { name: 'Turquesa', hex: '#0D9488' },
  { name: 'Verde', hex: '#16A34A' },
  { name: 'Oliva', hex: '#4D7C0F' },
  { name: 'Ocre', hex: '#A16207' },
  { name: 'Laranja', hex: '#EA580C' },
  { name: 'Carmim', hex: '#E11D48' },
  { name: 'Rosa', hex: '#DB2777' },
  { name: 'Magenta', hex: '#C026D3' },
  { name: 'Violeta', hex: '#7C3AED' },
  { name: 'Cinza', hex: '#6B7280' },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** A cor personalizada da conta em `#RRGGBB` maiúsculo, ou `null` se ausente (cópia local antiga) ou malformada. */
export function accountColor(colorHex: string | null | undefined): string | null {
  return colorHex && HEX.test(colorHex) ? colorHex.toUpperCase() : null;
}
