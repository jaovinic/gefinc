import { ACCOUNT_ICONS, ACCOUNT_TYPES, CATEGORY_TYPES, HOLDER_TYPES, ERROR_CODES, RECURRENCE_TYPES, TRANSACTION_STATUSES } from './models';

describe('core-models', () => {
  it('expõe os valores dos enums do contrato', () => {
    expect(ACCOUNT_TYPES).toEqual(['CHECKING', 'CASH', 'CREDIT_CARD']);
    expect(HOLDER_TYPES).toEqual(['PF', 'PJ']);
    expect(ACCOUNT_ICONS).toHaveLength(16);
    expect(ACCOUNT_ICONS).toContain('card-gold');
    expect(CATEGORY_TYPES).toEqual(['INCOME', 'EXPENSE']);
    expect(RECURRENCE_TYPES).toEqual(['FIXED', 'VARIABLE', 'INSTALLMENT']);
    expect(TRANSACTION_STATUSES).toEqual(['PENDING', 'PAID']);
  });

  it('expõe os códigos de erro tratados pelas interfaces', () => {
    expect(ERROR_CODES.staleVersion).toBe('STALE_VERSION');
    expect(ERROR_CODES.invoiceBalanceViolation).toBe('INVOICE_BALANCE_VIOLATION');
  });
});
