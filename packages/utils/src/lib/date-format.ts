/** "2026-12-10" → "10/12/2026" (formato brasileiro); entradas fora do padrão voltam como vieram. */
export function isoToBR(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

/** Data local de hoje no formato ISO ("2026-11-10"), sem converter para UTC. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Mês local corrente no formato "YYYY-MM". */
export function currentMonth(now: Date = new Date()): string {
  return todayIso(now).slice(0, 7);
}

const MONTH_ABBREVIATIONS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-11-17" ou "2026-11" → "nov/2026" (abreviações fixas em pt-BR); entradas fora do padrão voltam como vieram. */
export function monthLabelBR(iso: string): string {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(iso);
  const month = match ? Number(match[2]) : 0;
  return match && month >= 1 && month <= 12 ? `${MONTH_ABBREVIATIONS[month - 1]}/${match[1]}` : iso;
}
