import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fixedOccurrenceDueDate, invoiceDueDate } from './due-date';

interface DueDateVector {
  name: string;
  closingDay: number;
  dueDay: number;
  purchaseDate: string;
  expected: string;
}

const fixtures = JSON.parse(
  readFileSync(resolve(__dirname, '../../../core-models/fixtures/installments.json'), 'utf-8'),
) as { dueDate: DueDateVector[] };

describe('invoiceDueDate (vetores compartilhados com o backend)', () => {
  it('há vetores suficientes', () => {
    expect(fixtures.dueDate.length).toBeGreaterThanOrEqual(10);
  });

  it.each(fixtures.dueDate)('$name', ({ closingDay, dueDay, purchaseDate, expected }) => {
    expect(invoiceDueDate(purchaseDate, closingDay, dueDay)).toBe(expected);
  });
});

describe('fixedOccurrenceDueDate', () => {
  it('trata cada mês como compra no dia da data de compra original', () => {
    expect(fixedOccurrenceDueDate('2026-11-05', 2026, 12, 10, 17)).toBe('2026-12-17');
    expect(fixedOccurrenceDueDate('2026-11-05', 2027, 1, 10, 17)).toBe('2027-01-17');
  });

  it('compra após o fechamento vai para a fatura do mês seguinte', () => {
    expect(fixedOccurrenceDueDate('2026-11-12', 2026, 12, 10, 17)).toBe('2027-01-17');
  });

  it('limita o dia da compra ao último dia do mês', () => {
    expect(fixedOccurrenceDueDate('2026-01-31', 2026, 2, 28, 30)).toBe('2026-02-28');
  });
});

describe('validação de entrada', () => {
  it('recusa datas e dias inválidos', () => {
    expect(() => invoiceDueDate('2026-13-01', 10, 17)).toThrow();
    expect(() => invoiceDueDate('2026-11-05', 0, 17)).toThrow();
    expect(() => invoiceDueDate('2026-11-05', 10, 32)).toThrow();
  });
});
