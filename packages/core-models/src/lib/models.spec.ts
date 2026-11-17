import type { AccountUsage, AdminUserPage, SystemStatus, Transfer, TransferInput, TransferPage, TransferUpdate, UserProfile } from './models';
import { ADMIN_ERROR_CODES, ACCOUNT_ICONS, ACCOUNT_TYPES, CATEGORY_TYPES, HOLDER_TYPES, ERROR_CODES, RECURRENCE_TYPES, TRANSACTION_STATUSES, TRANSFERABLE_ACCOUNT_TYPES } from './models';

describe('core-models', () => {
  it('expõe os valores dos enums do contrato', () => {
    expect(ACCOUNT_TYPES).toEqual(['CHECKING', 'CASH', 'CREDIT_CARD']);
    expect(HOLDER_TYPES).toEqual(['PF', 'PJ']);
    expect(ACCOUNT_ICONS).toHaveLength(16);
    expect(ACCOUNT_ICONS).toContain('card-gold');
    expect(CATEGORY_TYPES).toEqual(['INCOME', 'EXPENSE']);
    expect(RECURRENCE_TYPES).toEqual(['FIXED', 'VARIABLE', 'INSTALLMENT']);
    expect(TRANSACTION_STATUSES).toEqual(['PENDING', 'PAID']);
    expect(TRANSFERABLE_ACCOUNT_TYPES).toEqual(['CHECKING', 'CASH']);
  });

  it('expõe os códigos de erro tratados pelas interfaces', () => {
    expect(ERROR_CODES.staleVersion).toBe('STALE_VERSION');
    expect(ERROR_CODES.invoiceBalanceViolation).toBe('INVOICE_BALANCE_VIOLATION');
  });

  it('descreve as transferências entre contas como no contrato', () => {
    const input: TransferInput = { fromAccountId: 1, toAccountId: 2, amount: '10.00', transferDate: '2026-11-10' };
    const update: TransferUpdate = { ...input, description: 'Reserva', version: 0 };
    const transfer: Transfer = { id: 7, ...input, scheduled: false, version: 0 };
    const page: TransferPage = { content: [transfer], page: 0, size: 25, totalElements: 1 };

    expect(update.version).toBe(0);
    expect(page.content[0].scheduled).toBe(false);
  });

  it('a prévia de exclusão da conta aceita cópias antigas sem a contagem de transferências', () => {
    const old: AccountUsage = { canDelete: true, transactionCount: 0, invoicePaymentCount: 0, linkedCards: [], openingBalance: '0.00' };
    const current: AccountUsage = { ...old, transferCount: 2 };

    expect(old.transferCount).toBeUndefined();
    expect(current.transferCount).toBe(2);
  });

  it('descreve o painel administrativo como no contrato', () => {
    const status: SystemStatus = { maintenance: false, signupsOpen: true };
    const page: AdminUserPage = {
      content: [{ id: 1, email: 'ana@example.com', createdAt: '2026-11-10T15:00:00Z', role: 'USER', suspended: false, deletionPending: false }],
      page: 0,
      size: 25,
      totalElements: 1,
      counts: { active: 1, suspended: 0, deletionPending: 0, admin: 0 },
    };
    // `admin` e `notices` são opcionais: cópias antigas do perfil continuam válidas
    const profile: UserProfile = { id: 1, email: 'ana@example.com', createdAt: '2026-11-10T15:00:00Z' };

    expect(status.message).toBeUndefined();
    expect(page.content[0].role).toBe('USER');
    expect(profile.admin).toBeUndefined();
    expect(profile.notices).toBeUndefined();
  });

  it('expõe os 16 códigos de erro do painel', () => {
    expect(Object.values(ADMIN_ERROR_CODES)).toHaveLength(16);
    expect(ADMIN_ERROR_CODES.reauthFailed).toBe('REAUTH_FAILED');
    expect(ADMIN_ERROR_CODES.maintenance).toBe('MAINTENANCE');
  });
});
