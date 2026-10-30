import { defaultIconFor } from './account-icons';

describe('defaultIconFor', () => {
  it('conta bancária pessoa física usa o banco', () => {
    expect(defaultIconFor('CHECKING', 'PF')).toBe('bank');
  });

  it('conta bancária pessoa jurídica usa o prédio', () => {
    expect(defaultIconFor('CHECKING', 'PJ')).toBe('building');
  });

  it('conta bancária sem titular (cópia local antiga) é tratada como pessoa física', () => {
    expect(defaultIconFor('CHECKING', null)).toBe('bank');
    expect(defaultIconFor('CHECKING')).toBe('bank');
  });

  it('dinheiro em espécie usa o dinheiro', () => {
    expect(defaultIconFor('CASH', null)).toBe('cash');
  });

  it('cartão de crédito usa o cartão', () => {
    expect(defaultIconFor('CREDIT_CARD', 'PJ')).toBe('card');
  });
});
