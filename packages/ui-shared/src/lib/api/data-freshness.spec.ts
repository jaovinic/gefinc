import { TestBed } from '@angular/core/testing';
import { DATA_FRESHNESS, formatSyncedAt } from './data-freshness';

describe('frescor dos dados', () => {
  it('sem o app móvel fornecer, os dados são sempre atuais (sem data)', () => {
    expect(TestBed.inject(DATA_FRESHNESS)()).toBeNull();
  });

  it('formata a data da última sincronização como dd/MM HH:mm', () => {
    expect(formatSyncedAt(new Date(2026, 10, 3, 9, 5))).toBe('03/11 09:05');
    expect(formatSyncedAt(new Date(2026, 11, 31, 23, 59))).toBe('31/12 23:59');
  });
});
