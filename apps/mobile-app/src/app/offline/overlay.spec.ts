import type { Account, Category, Transaction, TransactionPage } from '@gefinc/core-models';
import { OverlayContext, applyPending, isPendingRow } from './overlay';
import type { PendingOp } from './pending-queue';

const accounts: Account[] = [
  { id: 1, name: 'Itaú', type: 'CHECKING', active: true, version: 0, openingBalance: '0.00' },
  { id: 2, name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, active: true, version: 0, openingBalance: '0.00' },
];
const categories: Category[] = [
  { id: 10, name: 'Alimentação', type: 'EXPENSE', colorHex: '#F97316' },
  { id: 20, name: 'Salário', type: 'INCOME', colorHex: '#00E599' },
];
const ctx: OverlayContext = { accounts, categories, today: '2026-11-10' };

const empty = (): TransactionPage => ({ content: [], page: 0, size: 25, totalElements: 0 });
const item = (over: Partial<Transaction>): Transaction =>
  ({
    id: 5, groupId: 50, accountId: 1, categoryId: 10, description: 'Luz', recurrenceType: 'VARIABLE',
    installmentNumber: 1, totalInstallments: 1, amount: '90.50', dueDate: '2026-11-15', status: 'PENDING',
    overdue: false, version: 0, ...over,
  }) as Transaction;
const create = (body: object, state: PendingOp['state'] = 'PENDING'): PendingOp => ({
  id: 'op-' + Math.random(), kind: 'CREATE_GROUP', path: '/transaction-groups', body, createdAt: 1, state, label: 'novo',
});
const base = { description: 'Mercado', accountId: 1, categoryId: 10, purchaseDate: '2026-11-08' };

describe('applyPending (lista de lançamentos com as operações ainda não enviadas)', () => {
  it('lançamento avulso novo aparece na lista do mês, marcado como pendente de envio', () => {
    const op = create({ ...base, recurrenceType: 'VARIABLE', totalAmount: '150.00', firstDueDate: '2026-11-12' });

    const result = applyPending(empty(), [op], ctx, { month: '2026-11' });

    expect(result.totalElements).toBe(1);
    const row = result.content[0];
    expect(isPendingRow(row)).toBe(true);
    expect(row).toMatchObject({
      description: 'Mercado', amount: '150.00', dueDate: '2026-11-12', status: 'PENDING', accountId: 1, categoryId: 10,
      recurrenceType: 'VARIABLE', installmentNumber: 1, totalInstallments: 1, overdue: false,
    });
    expect(applyPending(empty(), [op], ctx, { month: '2026-12' }).content).toHaveLength(0);
  });

  it('parcelado gera as parcelas pelas regras do pacote utils (resto de centavos na última)', () => {
    const op = create({ ...base, recurrenceType: 'INSTALLMENT', totalAmount: '100.00', totalInstallments: 3, firstDueDate: '2026-11-12' });

    const nov = applyPending(empty(), [op], ctx, { month: '2026-11' }).content;
    const dec = applyPending(empty(), [op], ctx, { month: '2026-12' }).content;
    const jan = applyPending(empty(), [op], ctx, { month: '2027-01' }).content;

    expect([nov[0].amount, dec[0].amount, jan[0].amount]).toEqual(['33.33', '33.33', '33.34']);
    expect([nov[0].installmentNumber, dec[0].installmentNumber, jan[0].installmentNumber]).toEqual([1, 2, 3]);
    expect(jan[0]).toMatchObject({ totalInstallments: 3, dueDate: '2027-01-12' });
  });

  it('cartão com 10 parcelas atravessa a virada de ano: uma linha por mês, com número e total', () => {
    const op = create({
      ...base, accountId: 2, recurrenceType: 'INSTALLMENT', totalAmount: '1000.00', totalInstallments: 10, purchaseDate: '2026-11-12',
    });

    const all = applyPending(empty(), [op], ctx, {}).content;
    expect(all).toHaveLength(10);
    expect(all.map((r) => r.dueDate)).toEqual([
      '2026-12-17', '2027-01-17', '2027-02-17', '2027-03-17', '2027-04-17',
      '2027-05-17', '2027-06-17', '2027-07-17', '2027-08-17', '2027-09-17',
    ]);
    expect(all.map((r) => r.installmentNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(all.every((r) => r.totalInstallments === 10 && r.amount === '100.00')).toBe(true);
    expect(applyPending(empty(), [op], ctx, { month: '2027-01' }).content).toMatchObject([{ installmentNumber: 2, dueDate: '2027-01-17' }]);
  });

  it('parcelado com total menor que um centavo por parcela não quebra a lista nem fabrica linhas', () => {
    const invalid = create({ ...base, accountId: 2, recurrenceType: 'INSTALLMENT', totalAmount: '0.05', totalInstallments: 10 });
    const existing = item({ id: 7 });
    const page = { ...empty(), content: [existing], totalElements: 1 };

    const result = applyPending(page, [invalid], ctx, { month: '2026-11' });

    expect(result.content).toEqual([existing]);
    expect(result.totalElements).toBe(1);
  });

  it('no cartão o vencimento vem da fatura, ignorando a data informada', () => {
    const op = create({ ...base, accountId: 2, recurrenceType: 'VARIABLE', totalAmount: '60.00', purchaseDate: '2026-11-12' });

    const result = applyPending(empty(), [op], ctx, { month: '2026-12' });

    expect(result.content[0].dueDate).toBe('2026-12-17');
  });

  it('lançamento fixo aparece nos 12 meses a partir do primeiro vencimento', () => {
    const op = create({ ...base, recurrenceType: 'FIXED', totalAmount: '99.90', firstDueDate: '2026-11-12' });

    expect(applyPending(empty(), [op], ctx, { month: '2027-10' }).content).toHaveLength(1);
    expect(applyPending(empty(), [op], ctx, { month: '2027-11' }).content).toHaveLength(0);
    expect(applyPending(empty(), [op], ctx, { month: '2026-10' }).content).toHaveLength(0);
    expect(applyPending(empty(), [op], ctx, { month: '2027-03' }).content[0]).toMatchObject({ recurrenceType: 'FIXED', dueDate: '2027-03-12' });
  });

  it('marca como atrasado o que já venceu', () => {
    const op = create({ ...base, recurrenceType: 'VARIABLE', totalAmount: '10.00', firstDueDate: '2026-11-05' });

    expect(applyPending(empty(), [op], ctx, { month: '2026-11' }).content[0].overdue).toBe(true);
  });

  it('mantém a ordem por vencimento junto com os itens do servidor', () => {
    const op = create({ ...base, recurrenceType: 'VARIABLE', totalAmount: '10.00', firstDueDate: '2026-11-12' });
    const page = { content: [item({ id: 1, dueDate: '2026-11-05' }), item({ id: 2, dueDate: '2026-11-20' })], page: 0, size: 25, totalElements: 2 };

    const result = applyPending(page, [op], ctx, { month: '2026-11' });

    expect(result.content.map((t) => t.dueDate)).toEqual(['2026-11-05', '2026-11-12', '2026-11-20']);
    expect(result.totalElements).toBe(3);
  });

  it('pagar marca o item como pago e desfazer volta a pendente', () => {
    const pay: PendingOp = { id: 'p', kind: 'PAY', path: '/transactions/5/pay', body: { paymentDate: '2026-11-10' }, createdAt: 2, state: 'PENDING', label: 'pagar' };
    const unpay: PendingOp = { id: 'u', kind: 'UNPAY', path: '/transactions/6/unpay', body: null, createdAt: 3, state: 'PENDING', label: 'desfazer' };
    const page = { content: [item({ id: 5 }), item({ id: 6, status: 'PAID', paymentDate: '2026-11-01' })], page: 0, size: 25, totalElements: 2 };

    const [paid, undone] = applyPending(page, [pay, unpay], ctx, { month: '2026-11' }).content;

    expect(paid).toMatchObject({ id: 5, status: 'PAID', paymentDate: '2026-11-10', overdue: false });
    expect(undone.status).toBe('PENDING');
    expect(undone.paymentDate).toBeUndefined();
  });

  it('aplica os filtros da consulta também sobre o que mudou localmente', () => {
    const pay: PendingOp = { id: 'p', kind: 'PAY', path: '/transactions/5/pay', body: { paymentDate: '2026-11-10' }, createdAt: 2, state: 'PENDING', label: 'pagar' };
    const page = { content: [item({ id: 5 }), item({ id: 7, description: 'Água' })], page: 0, size: 25, totalElements: 2 };
    const newIncome = create({ ...base, categoryId: 20, recurrenceType: 'VARIABLE', totalAmount: '5000.00', firstDueDate: '2026-11-12' });
    const newOnCard = create({ ...base, accountId: 2, recurrenceType: 'VARIABLE', totalAmount: '10.00', purchaseDate: '2026-11-01' });

    const pending = applyPending(page, [pay, newIncome], ctx, { month: '2026-11', status: 'PENDING' });
    expect(pending.content.map((t) => t.id).filter((id) => id > 0)).toEqual([7]);
    expect(pending.content.some((t) => isPendingRow(t) && t.categoryId === 20)).toBe(true);
    expect(pending.totalElements).toBe(2);

    expect(applyPending(empty(), [newIncome], ctx, { month: '2026-11', kind: 'EXPENSE' }).content).toHaveLength(0);
    expect(applyPending(empty(), [newIncome], ctx, { month: '2026-11', kind: 'INCOME' }).content).toHaveLength(1);
    expect(applyPending(empty(), [newOnCard], ctx, { month: '2026-11', accountId: 1 }).content).toHaveLength(0);
    expect(applyPending(empty(), [newOnCard], ctx, { month: '2026-11', categoryId: 20 }).content).toHaveLength(0);
    expect(applyPending(empty(), [newIncome], ctx, { month: '2026-11', status: 'PAID' }).content).toHaveLength(0);
  });

  describe('receita criada sem conexão', () => {
    const incomeBody = { description: 'Salário', accountId: 1, categoryId: 20, recurrenceType: 'VARIABLE', totalAmount: '5000.00' };

    it('com data de hoje ou anterior já entra como recebida, com a data do recebimento', () => {
      const today = create({ ...incomeBody, purchaseDate: '2026-11-10', firstDueDate: '2026-11-10' });
      const past = create({ ...incomeBody, purchaseDate: '2026-11-05', firstDueDate: '2026-11-05' });

      const [now] = applyPending(empty(), [today], ctx, { month: '2026-11' }).content;
      const [before] = applyPending(empty(), [past], ctx, { month: '2026-11' }).content;

      expect(now).toMatchObject({ status: 'PAID', paymentDate: '2026-11-10', overdue: false });
      expect(before).toMatchObject({ status: 'PAID', paymentDate: '2026-11-05', overdue: false });
    });

    it('com data futura fica a receber, sem atraso', () => {
      const future = create({ ...incomeBody, purchaseDate: '2026-11-20', firstDueDate: '2026-11-20' });
      const [row] = applyPending(empty(), [future], ctx, { month: '2026-11' }).content;
      expect(row).toMatchObject({ status: 'PENDING', overdue: false });
      expect(row.paymentDate).toBeUndefined();
    });

    it('não depende de settled (ignorado se vier numa operação antiga)', () => {
      const old = create({ ...incomeBody, settled: false, purchaseDate: '2026-11-08', firstDueDate: '2026-11-08' });
      const [row] = applyPending(empty(), [old], ctx, { month: '2026-11' }).content;
      expect(row.status).toBe('PAID');
    });

    it('fixa entra recebida nos meses até hoje e a receber nos futuros', () => {
      const fixed = create({ ...incomeBody, recurrenceType: 'FIXED', purchaseDate: '2026-10-05', firstDueDate: '2026-10-05' });
      const oct = applyPending(empty(), [fixed], ctx, { month: '2026-10' }).content[0];
      const dec = applyPending(empty(), [fixed], ctx, { month: '2026-12' }).content[0];
      expect(oct.status).toBe('PAID');
      expect(dec.status).toBe('PENDING');
    });

    it('em cartão não é fabricada na lista (o servidor a recusa)', () => {
      const onCard = create({ ...incomeBody, accountId: 2, purchaseDate: '2026-11-08' });
      expect(applyPending(empty(), [onCard], ctx, { month: '2026-11' }).content).toHaveLength(0);
    });

    it('despesa vencida continua atrasada e despesa nunca nasce paga', () => {
      const expense = create({ ...base, recurrenceType: 'VARIABLE', totalAmount: '10.00', firstDueDate: '2026-11-05' });
      const [row] = applyPending(empty(), [expense], ctx, { month: '2026-11' }).content;
      expect(row).toMatchObject({ status: 'PENDING', overdue: true });
    });

    it('desfazer o recebimento de uma receita futura não a deixa atrasada', () => {
      const unpay: PendingOp = { id: 'u', kind: 'UNPAY', path: '/transactions/5/unpay', body: null, createdAt: 2, state: 'PENDING', label: 'desfazer' };
      const page = { content: [item({ id: 5, categoryId: 20, status: 'PAID', dueDate: '2026-11-05', paymentDate: '2026-11-01' })], page: 0, size: 25, totalElements: 1 };
      const [row] = applyPending(page, [unpay], ctx, { month: '2026-11' }).content;
      expect(row).toMatchObject({ status: 'PENDING', overdue: false });
    });
  });

  it('ignora operações recusadas e não altera a página original', () => {
    const rejected = create({ ...base, recurrenceType: 'VARIABLE', totalAmount: '10.00', firstDueDate: '2026-11-12' }, 'REJECTED');
    const original = empty();

    const result = applyPending(original, [rejected], ctx, { month: '2026-11' });

    expect(result.content).toHaveLength(0);
    expect(original.content).toHaveLength(0);
  });

  it('só linhas criadas localmente têm identificador negativo', () => {
    expect(isPendingRow(item({ id: 5 }))).toBe(false);
    expect(isPendingRow(item({ id: -1 }))).toBe(true);
  });
});
