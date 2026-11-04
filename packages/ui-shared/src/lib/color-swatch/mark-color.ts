/** Texto escuro do tema (`--color-gefinc-bg`) e branco: as duas cores candidatas para algo desenhado sobre uma cor. */
export const MARK_DARK = '#090D16';
export const MARK_LIGHT = '#FFFFFF';

/** Luminância relativa (WCAG) de `#RRGGBB`. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Cor de maior contraste sobre `hex` (marca de "selecionado", ícone de uma conta): o texto escuro do tema ou o branco. */
export function markColor(hex: string): string {
  const background = relativeLuminance(hex) + 0.05;
  const dark = background / (relativeLuminance(MARK_DARK) + 0.05);
  const light = (relativeLuminance(MARK_LIGHT) + 0.05) / background;
  return dark >= light ? MARK_DARK : MARK_LIGHT;
}
