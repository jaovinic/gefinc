/** "2026-12-10" → "10/12/2026" (formato brasileiro); entradas fora do padrão voltam como vieram. */
export function isoToBR(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}
