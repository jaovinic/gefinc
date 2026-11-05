import type { AccountUsage } from '@gefinc/core-models';
import { blockedAccountMessage } from './account-usage';

const empty: AccountUsage = { canDelete: false, transactionCount: 0, invoicePaymentCount: 0, transferCount: 0, linkedCards: [], openingBalance: '0.00' };

describe('blockedAccountMessage', () => {
  it('lista só as partes com dados, com plural e o conselho de inativar', () => {
    expect(blockedAccountMessage('Itaú', { ...empty, transactionCount: 12, invoicePaymentCount: 2, linkedCards: [{ id: 1, name: 'Nubank' }, { id: 2, name: 'Inter' }] })).toBe(
      'A conta "Itaú" não pode ser excluída: possui 12 lançamentos, 2 pagamentos de fatura e cartões vinculados (Nubank, Inter). Inative a conta para preservar o histórico.',
    );
    expect(blockedAccountMessage('Itaú', { ...empty, transactionCount: 1 })).toBe('A conta "Itaú" não pode ser excluída: possui 1 lançamento. Inative a conta para preservar o histórico.');
    expect(blockedAccountMessage('Itaú', { ...empty, linkedCards: [{ id: 1, name: 'Nubank' }] })).toContain('possui cartão vinculado (Nubank)');
  });

  it('só com saldo inicial orienta zerá-lo', () => {
    expect(blockedAccountMessage('Carteira', { ...empty, openingBalance: '500.00' })).toBe(
      'A conta "Carteira" não pode ser excluída: possui saldo inicial de R$ 500,00. Zere o saldo inicial para poder excluir.',
    );
  });

  it('saldo inicial junto de lançamentos entra na lista', () => {
    expect(blockedAccountMessage('Carteira', { ...empty, transactionCount: 3, openingBalance: '-10.50' })).toBe(
      'A conta "Carteira" não pode ser excluída: possui 3 lançamentos e saldo inicial de -R$ 10,50. Inative a conta para preservar o histórico.',
    );
  });

  it('transferências entram na lista, no singular e no plural, e orientam inativar', () => {
    expect(blockedAccountMessage('Itaú', { ...empty, transferCount: 1 })).toBe(
      'A conta "Itaú" não pode ser excluída: possui 1 transferência. Inative a conta para preservar o histórico.',
    );
    expect(blockedAccountMessage('Itaú', { ...empty, transactionCount: 2, transferCount: 3, openingBalance: '10.00' })).toBe(
      'A conta "Itaú" não pode ser excluída: possui 2 lançamentos, 3 transferências e saldo inicial de R$ 10,00. Inative a conta para preservar o histórico.',
    );
  });

  it('cópia antiga da prévia, sem transferCount, continua válida (vale 0)', () => {
    const old: Partial<AccountUsage> = { ...empty, transactionCount: 1 };
    delete old.transferCount;
    expect(blockedAccountMessage('Itaú', old as AccountUsage)).toBe(
      'A conta "Itaú" não pode ser excluída: possui 1 lançamento. Inative a conta para preservar o histórico.',
    );
  });
});
