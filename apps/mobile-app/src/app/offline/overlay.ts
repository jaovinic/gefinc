import type {
  Account,
  Category,
  CategoryType,
  RecurrenceType,
  Transaction,
  TransactionPage,
  TransactionStatus,
} from '@gefinc/core-models';
import { fixedOccurrenceDueDate, invoiceDueDate, monthlyDueDate, scheduleInstallments } from '@gefinc/utils';
import type { PendingOp } from './pending-queue';

export interface OverlayContext {
  accounts: Account[];
  categories: Category[];
  /** Hoje em ISO (AAAA-MM-DD), para marcar o que já venceu. */
  today: string;
}

/** Filtros da consulta de lançamentos que está sendo mostrada. */
export interface OverlayQuery {
  month?: string;
  accountId?: number;
  categoryId?: number;
  kind?: CategoryType;
  status?: TransactionStatus;
  recurrenceType?: RecurrenceType;
}

interface GroupBody {
  description: string;
  recurrenceType: RecurrenceType;
  totalAmount: string;
  totalInstallments?: number;
  accountId: number;
  categoryId: number;
  purchaseDate: string;
  firstDueDate?: string;
}

interface Row {
  number: number;
  total: number;
  amount: string;
  dueDate: string;
}

/** Linhas criadas só no aparelho têm identificador negativo até o servidor confirmar. */
export function isPendingRow(tx: Transaction): boolean {
  return tx.id < 0;
}

/**
 * Mostra, por cima da lista de lançamentos, o efeito esperado das operações ainda não enviadas:
 * lançamentos novos (parcelas e vencimentos pelas mesmas regras do servidor, em `@gefinc/utils`) e
 * pagamentos feitos ou desfeitos. Operações recusadas não entram. Não altera a página recebida.
 */
export function applyPending(page: TransactionPage, ops: PendingOp[], ctx: OverlayContext, query: OverlayQuery): TransactionPage {
  const live = ops.filter((o) => o.state !== 'REJECTED').sort((a, b) => a.createdAt - b.createdAt);
  if (live.length === 0) {
    return page;
  }
  let items: Transaction[] = page.content.map((t) => ({ ...t }));

  for (const op of live) {
    if (op.kind === 'CREATE_GROUP') {
      continue;
    }
    const id = Number(/\/transactions\/(\d+)\//.exec(op.path)?.[1]);
    const item = items.find((t) => t.id === id);
    if (!item) {
      continue;
    }
    if (op.kind === 'PAY') {
      item.status = 'PAID';
      item.paymentDate = (op.body as { paymentDate?: string } | null)?.paymentDate;
      item.overdue = false;
    } else {
      item.status = 'PENDING';
      delete item.paymentDate;
      item.overdue = item.dueDate < ctx.today;
    }
  }

  // Itens que mudaram de status deixam de combinar com o filtro de status da tela.
  const before = items.length;
  if (query.status) {
    items = items.filter((t) => t.status === query.status);
  }
  const dropped = before - items.length;

  let sequence = 0;
  const created: Transaction[] = [];
  for (const op of live) {
    if (op.kind !== 'CREATE_GROUP') {
      continue;
    }
    const body = op.body as GroupBody;
    sequence++;
    for (const row of rowsFor(body, ctx)) {
      const tx = {
        id: -(sequence * 1000 + row.number),
        groupId: -sequence,
        accountId: body.accountId,
        categoryId: body.categoryId,
        description: body.description,
        recurrenceType: body.recurrenceType,
        installmentNumber: row.number,
        totalInstallments: row.total,
        amount: row.amount,
        dueDate: row.dueDate,
        status: 'PENDING',
        overdue: row.dueDate < ctx.today,
        version: -1,
      } as Transaction;
      if (matches(tx, query, ctx)) {
        created.push(tx);
      }
    }
  }

  for (const tx of created) {
    const at = items.findIndex((t) => t.dueDate > tx.dueDate);
    items.splice(at === -1 ? items.length : at, 0, tx);
  }
  return { ...page, content: items, totalElements: page.totalElements - dropped + created.length };
}

function matches(tx: Transaction, query: OverlayQuery, ctx: OverlayContext): boolean {
  if (query.month && tx.dueDate.slice(0, 7) !== query.month) {
    return false;
  }
  if (query.accountId && tx.accountId !== query.accountId) {
    return false;
  }
  if (query.categoryId && tx.categoryId !== query.categoryId) {
    return false;
  }
  if (query.status && tx.status !== query.status) {
    return false;
  }
  if (query.recurrenceType && tx.recurrenceType !== query.recurrenceType) {
    return false;
  }
  if (query.kind && ctx.categories.find((c) => c.id === tx.categoryId)?.type !== query.kind) {
    return false;
  }
  return true;
}

function rowsFor(body: GroupBody, ctx: OverlayContext): Row[] {
  const account = ctx.accounts.find((a) => a.id === body.accountId);
  const card = account?.type === 'CREDIT_CARD' && account.closingDay !== undefined && account.dueDay !== undefined;
  const closingDay = card ? account.closingDay : undefined;
  const dueDay = card ? account.dueDay : undefined;

  if (body.recurrenceType === 'INSTALLMENT') {
    return scheduleInstallments({
      closingDay,
      dueDay,
      purchaseDate: body.purchaseDate,
      firstDueDate: body.firstDueDate,
      total: body.totalAmount,
      count: body.totalInstallments ?? 1,
    }).map((p) => ({ number: p.number, total: body.totalInstallments ?? 1, amount: p.amount, dueDate: p.dueDate }));
  }
  if (body.recurrenceType === 'FIXED') {
    const rows: Row[] = [];
    for (let i = 0; i < 12; i++) {
      let dueDate: string;
      if (card) {
        const base = new Date(`${body.purchaseDate}T00:00:00`);
        const target = new Date(base.getFullYear(), base.getMonth() + i, 1);
        dueDate = fixedOccurrenceDueDate(body.purchaseDate, target.getFullYear(), target.getMonth() + 1, closingDay as number, dueDay as number);
      } else {
        const first = body.firstDueDate ?? body.purchaseDate;
        dueDate = monthlyDueDate(first, i, Number(first.slice(8, 10)));
      }
      rows.push({ number: 1, total: 1, amount: body.totalAmount, dueDate });
    }
    return rows;
  }
  const dueDate = card ? invoiceDueDate(body.purchaseDate, closingDay as number, dueDay as number) : (body.firstDueDate ?? body.purchaseDate);
  return [{ number: 1, total: 1, amount: body.totalAmount, dueDate }];
}
