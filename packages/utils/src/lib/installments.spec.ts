import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scheduleInstallments } from './installments';
import { sumMoney } from './money';

interface Vector {
  name: string;
  kind: 'card' | 'account';
  closingDay?: number;
  dueDay?: number;
  purchaseDate: string;
  firstDueDate?: string;
  total: string;
  count: number;
  expected: { number: number; amount: string; dueDate: string }[];
}

const fixtures = JSON.parse(
  readFileSync(resolve(__dirname, '../../../core-models/fixtures/installments.json'), 'utf-8'),
) as { installments: Vector[] };

describe('scheduleInstallments (vetores compartilhados com o backend)', () => {
  it('há vetores suficientes', () => {
    expect(fixtures.installments.length).toBeGreaterThanOrEqual(9);
  });

  it.each(fixtures.installments)('$name', (vector) => {
    const result = scheduleInstallments({
      closingDay: vector.kind === 'card' ? vector.closingDay : undefined,
      dueDay: vector.kind === 'card' ? vector.dueDay : undefined,
      purchaseDate: vector.purchaseDate,
      firstDueDate: vector.firstDueDate,
      total: vector.total,
      count: vector.count,
    });
    expect(result).toEqual(vector.expected);
    expect(sumMoney(result.map((i) => i.amount))).toBe(vector.total);
  });

  it('134,30 em 4x: a primeira parcela leva os 2 centavos de resto', () => {
    const result = scheduleInstallments({ purchaseDate: '2026-11-01', firstDueDate: '2026-11-10', total: '134.30', count: 4 });
    expect(result.map((i) => i.amount)).toEqual(['33.59', '33.57', '33.57', '33.57']);
  });

  it('recusa total menor que um centavo por parcela (0,01 em 3x)', () => {
    expect(() => scheduleInstallments({ purchaseDate: '2026-11-01', firstDueDate: '2026-11-10', total: '0.01', count: 3 })).toThrow();
  });

  it('recusa conta sem primeiro vencimento e quantidade inválida', () => {
    expect(() => scheduleInstallments({ purchaseDate: '2026-11-01', total: '100.00', count: 3 })).toThrow();
    expect(() => scheduleInstallments({ purchaseDate: '2026-11-01', firstDueDate: '2026-11-10', total: '100.00', count: 0 })).toThrow();
  });
});
