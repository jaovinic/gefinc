import { accountsFor, canTransfer, isAccountAllowed, reconcileAccount, transferableAccounts } from './account-rules';

const accounts = [
  { id: 1, type: 'CHECKING', active: true },
  { id: 2, type: 'CREDIT_CARD', active: true },
  { id: 3, type: 'CASH', active: true },
  { id: 4, type: 'CHECKING', active: false },
];

describe('account-rules', () => {
  it('receita só aceita conta bancária e dinheiro; despesa aceita todas', () => {
    expect(isAccountAllowed('INCOME', accounts[0])).toBe(true);
    expect(isAccountAllowed('INCOME', accounts[2])).toBe(true);
    expect(isAccountAllowed('INCOME', accounts[1])).toBe(false);
    expect(accounts.every((a) => isAccountAllowed('EXPENSE', a))).toBe(true);
  });

  it('accountsFor tira os cartões da receita e preserva a ordem', () => {
    expect(accountsFor('INCOME', accounts).map((a) => a.id)).toEqual([1, 3, 4]);
    expect(accountsFor('EXPENSE', accounts).map((a) => a.id)).toEqual([1, 2, 3, 4]);
  });

  it('reconcileAccount mantém a conta que vale para a natureza', () => {
    expect(reconcileAccount('INCOME', accounts, 3)).toBe(3);
    expect(reconcileAccount('EXPENSE', accounts, 2)).toBe(2);
  });

  it('cartão escolhido em receita volta à preferida ou à primeira conta ativa permitida', () => {
    expect(reconcileAccount('INCOME', accounts, 2, 3)).toBe(3);
    expect(reconcileAccount('INCOME', accounts, 2)).toBe(1);
    expect(reconcileAccount('INCOME', accounts, 2, 2)).toBe(1); // a preferida também é inválida
    expect(reconcileAccount('INCOME', accounts, 2, 4)).toBe(1); // inativa não vale como preferida
  });

  it('sem conta permitida e ativa devolve 0', () => {
    expect(reconcileAccount('INCOME', [accounts[1]], 2)).toBe(0);
    expect(reconcileAccount('INCOME', [accounts[3]], 0)).toBe(0);
    expect(reconcileAccount('EXPENSE', [], 0)).toBe(0);
  });

  it('transferência só aceita conta bancária e dinheiro ativas, nunca cartão nem inativa', () => {
    expect(canTransfer(accounts[0])).toBe(true);
    expect(canTransfer(accounts[2])).toBe(true);
    expect(canTransfer(accounts[1])).toBe(false);
    expect(canTransfer(accounts[3])).toBe(false);
    expect(transferableAccounts(accounts).map((a) => a.id)).toEqual([1, 3]);
  });
});
