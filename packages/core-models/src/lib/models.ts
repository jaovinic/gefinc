import type { components } from '../generated/api';

/** Tipos do contrato REST. Gerados de `openapi/gefinc.openapi.yaml` por `nx run core-models:generate`. */
type Schemas = components['schemas'];

export type Money = Schemas['Money'];
export type Month = Schemas['Month'];
export type AccountType = Schemas['AccountType'];
export type CategoryType = Schemas['CategoryType'];
export type RecurrenceType = Schemas['RecurrenceType'];
export type TransactionStatus = Schemas['TransactionStatus'];

export type Problem = Schemas['Problem'];
export type ValidationProblem = Schemas['ValidationProblem'];
export type DeletionPendingProblem = Schemas['DeletionPendingProblem'];

export type RegisterRequest = Schemas['RegisterRequest'];
export type Credentials = Schemas['Credentials'];
export type RefreshRequest = Schemas['RefreshRequest'];
export type TokenResponse = Schemas['TokenResponse'];
export type UserProfile = Schemas['UserProfile'];

export type Account = Schemas['Account'];
export type AccountInput = Schemas['AccountInput'];
export type AccountUpdate = Schemas['AccountUpdate'];
export type Category = Schemas['Category'];
export type CategoryInput = Schemas['CategoryInput'];

export type TransactionGroupInput = Schemas['TransactionGroupInput'];
export type TransactionGroupUpdate = Schemas['TransactionGroupUpdate'];
export type TransactionGroupDetail = Schemas['TransactionGroupDetail'];
export type GroupImpact = Schemas['GroupImpact'];
export type Transaction = Schemas['Transaction'];
export type TransactionPatch = Schemas['TransactionPatch'];
export type TransactionPage = Schemas['TransactionPage'];

export type Invoice = Schemas['Invoice'];
export type InvoicePayment = Schemas['InvoicePayment'];
export type InvoicePaymentInput = Schemas['InvoicePaymentInput'];
export type InvoiceProjection = Schemas['InvoiceProjection'];
export type Dashboard = Schemas['Dashboard'];
export type CashflowMonth = Schemas['CashflowMonth'];
export type DueSummary = Schemas['DueSummary'];

/** Valores dos enums para uso em tempo de execução (listas, selects, validações). */
export const ACCOUNT_TYPES = ['CHECKING', 'CASH', 'CREDIT_CARD'] as const satisfies readonly AccountType[];
export const CATEGORY_TYPES = ['INCOME', 'EXPENSE'] as const satisfies readonly CategoryType[];
export const RECURRENCE_TYPES = ['FIXED', 'VARIABLE', 'INSTALLMENT'] as const satisfies readonly RecurrenceType[];
export const TRANSACTION_STATUSES = ['PENDING', 'PAID'] as const satisfies readonly TransactionStatus[];

/** Códigos estáveis de erro (`Problem.code`) tratados pelas interfaces. */
export const ERROR_CODES = {
  accountDeletionPending: 'ACCOUNT_DELETION_PENDING',
  accountInactive: 'ACCOUNT_INACTIVE',
  accountInUse: 'ACCOUNT_IN_USE',
  categoryInUse: 'CATEGORY_IN_USE',
  invoiceBalanceViolation: 'INVOICE_BALANCE_VIOLATION',
  invalidResetToken: 'INVALID_RESET_TOKEN',
  staleVersion: 'STALE_VERSION',
} as const;
