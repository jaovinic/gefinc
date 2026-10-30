import type { components } from '../generated/api';

/** Tipos do contrato REST. Gerados de `openapi/gefinc.openapi.yaml` por `nx run core-models:generate`. */
type Schemas = components['schemas'];

export type Money = Schemas['Money'];
export type Month = Schemas['Month'];
export type AccountType = Schemas['AccountType'];
export type HolderType = Schemas['HolderType'];
export type AccountIcon = Schemas['AccountIcon'];
export type CategoryType = Schemas['CategoryType'];
export type RecurrenceType = Schemas['RecurrenceType'];
export type TransactionStatus = Schemas['TransactionStatus'];

export type Problem = Schemas['Problem'];
export type ValidationProblem = Schemas['ValidationProblem'];
export type DeletionPendingProblem = Schemas['DeletionPendingProblem'];
export type InUseProblem = Schemas['InUseProblem'];

export type RegisterRequest = Schemas['RegisterRequest'];
export type Credentials = Schemas['Credentials'];
export type RefreshRequest = Schemas['RefreshRequest'];
export type TokenResponse = Schemas['TokenResponse'];
export type UserProfile = Schemas['UserProfile'];

export type Account = Schemas['Account'];
export type AccountInput = Schemas['AccountInput'];
export type AccountUpdate = Schemas['AccountUpdate'];
export type AccountUsage = Schemas['AccountUsage'];
export type Category = Schemas['Category'];
export type CategoryUsage = Schemas['CategoryUsage'];
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
export type AccountBalance = Schemas['AccountBalance'];
export type Balances = Schemas['Balances'];
export type CashflowMonth = Schemas['CashflowMonth'];
export type DueSummary = Schemas['DueSummary'];

/** Valores dos enums para uso em tempo de execução (listas, selects, validações). */
export const ACCOUNT_TYPES = ['CHECKING', 'CASH', 'CREDIT_CARD'] as const satisfies readonly AccountType[];
export const HOLDER_TYPES = ['PF', 'PJ'] as const satisfies readonly HolderType[];
/** Catálogo de ícones de conta e cartão (cada chave tem um desenho em `@gefinc/ui-shared`). */
export const ACCOUNT_ICONS = [
  'bank',
  'building',
  'briefcase',
  'landmark',
  'wallet',
  'cash',
  'piggy',
  'card',
  'card-gold',
  'card-platinum',
  'card-black',
  'shield',
  'rocket',
  'star',
  'globe',
  'shopping-bag',
] as const satisfies readonly AccountIcon[];
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
