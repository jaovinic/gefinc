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

export type Transfer = Schemas['Transfer'];
export type TransferInput = Schemas['TransferInput'];
export type TransferUpdate = Schemas['TransferUpdate'];
export type TransferPage = Schemas['TransferPage'];

export type Invoice = Schemas['Invoice'];
export type InvoicePayment = Schemas['InvoicePayment'];
export type InvoicePaymentInput = Schemas['InvoicePaymentInput'];
export type InvoiceProjection = Schemas['InvoiceProjection'];
export type Dashboard = Schemas['Dashboard'];
export type AccountBalance = Schemas['AccountBalance'];
export type Balances = Schemas['Balances'];
export type CashflowMonth = Schemas['CashflowMonth'];
export type DueSummary = Schemas['DueSummary'];

// Painel administrativo (feature 005)
export type SystemStatus = Schemas['SystemStatus'];
export type InvitationPreview = Schemas['InvitationPreview'];
export type AcceptInvitationRequest = Schemas['AcceptInvitationRequest'];
export type UserNotice = Schemas['UserNotice'];
export type MaintenanceProblem = Schemas['MaintenanceProblem'];
export type Party = Schemas['Party'];
export type AdminRole = Schemas['AdminRole'];
export type AdminUserRow = Schemas['AdminUserRow'];
export type AdminUserCounts = Schemas['AdminUserCounts'];
export type AdminUserPage = Schemas['AdminUserPage'];
export type AdminLoginLock = Schemas['AdminLoginLock'];
export type AdminDeletionInfo = Schemas['AdminDeletionInfo'];
export type PendingEmailChange = Schemas['PendingEmailChange'];
export type AdminUserDetail = Schemas['AdminUserDetail'];
export type AdminSession = Schemas['AdminSession'];
export type AdminRenameRequest = Schemas['AdminRenameRequest'];
export type SuspendRequest = Schemas['SuspendRequest'];
export type RoleChangeRequest = Schemas['RoleChangeRequest'];
export type ForcePasswordResetRequest = Schemas['ForcePasswordResetRequest'];
export type EmailChangeRequest = Schemas['EmailChangeRequest'];
export type EmailChangeConfirmRequest = Schemas['EmailChangeConfirmRequest'];
export type DeletionRequest = Schemas['DeletionRequest'];
export type DeletionOutcome = Schemas['DeletionOutcome'];
export type AuditAction = Schemas['AuditAction'];
export type AuditResult = Schemas['AuditResult'];
export type AuditEntry = Schemas['AuditEntry'];
export type AuditClient = Schemas['AuditClient'];
export type AuditPage = Schemas['AuditPage'];
export type SystemHealth = Schemas['SystemHealth'];
export type DayCount = Schemas['DayCount'];
export type UsageStats = Schemas['UsageStats'];
export type AdminAlerts = Schemas['AdminAlerts'];
export type EmailKind = Schemas['EmailKind'];
export type EmailFailureReason = Schemas['EmailFailureReason'];
export type EmailConfig = Schemas['EmailConfig'];
export type EmailTestResult = Schemas['EmailTestResult'];
export type EmailDelivery = Schemas['EmailDelivery'];
export type EmailDeliveryPage = Schemas['EmailDeliveryPage'];
export type PendingCommunication = Schemas['PendingCommunication'];
export type ResendResult = Schemas['ResendResult'];
export type InvitationStatus = Schemas['InvitationStatus'];
export type InvitationRequest = Schemas['InvitationRequest'];
export type Invitation = Schemas['Invitation'];
export type DeletionReason = Schemas['DeletionReason'];
export type DeletionReasonInput = Schemas['DeletionReasonInput'];
export type EditableParameter = Schemas['EditableParameter'];
export type ReadOnlyParameter = Schemas['ReadOnlyParameter'];
export type Parameters = Schemas['Parameters'];
export type SignupsOpenRequest = Schemas['SignupsOpenRequest'];
export type MaintenanceRequest = Schemas['MaintenanceRequest'];
export type RevokeAllRequest = Schemas['RevokeAllRequest'];
export type RevokeAllResult = Schemas['RevokeAllResult'];

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
/** Tipos de conta que participam de transferências (cartão de crédito nunca; pagar fatura é outro fluxo). */
export const TRANSFERABLE_ACCOUNT_TYPES = ['CHECKING', 'CASH'] as const satisfies readonly AccountType[];

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

/** Códigos de erro do painel administrativo (`Problem.code`); recusas de regra nunca usam 401. */
export const ADMIN_ERROR_CODES = {
  accountNotUsable: 'ACCOUNT_NOT_USABLE',
  accountSuspended: 'ACCOUNT_SUSPENDED',
  adminDecisionLocked: 'ADMIN_DECISION_LOCKED',
  deletionAlreadyExecuted: 'DELETION_ALREADY_EXECUTED',
  emailChangeCodeInvalid: 'EMAIL_CHANGE_CODE_INVALID',
  invalidConfirmation: 'INVALID_CONFIRMATION',
  invitationExpired: 'INVITATION_EXPIRED',
  lastActiveReason: 'LAST_ACTIVE_REASON',
  lastAdmin: 'LAST_ADMIN',
  mailDeliveryFailed: 'MAIL_DELIVERY_FAILED',
  maintenance: 'MAINTENANCE',
  reasonNameTaken: 'REASON_NAME_TAKEN',
  reauthFailed: 'REAUTH_FAILED',
  rootProtected: 'ROOT_PROTECTED',
  selfActionForbidden: 'SELF_ACTION_FORBIDDEN',
  signupsClosed: 'SIGNUPS_CLOSED',
} as const;
