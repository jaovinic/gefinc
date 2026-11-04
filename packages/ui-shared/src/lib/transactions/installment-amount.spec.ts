import { belowMinimumPerInstallment, effectiveTotal, installmentOverview, installmentSummary } from './installment-amount';

describe('installment-amount', () => {
  it('no modo parcela o total é valor × quantidade; no modo total, o valor digitado', () => {
    expect(effectiveTotal('100.00', 10, 'INSTALLMENT')).toBe('1000.00');
    expect(effectiveTotal('33.33', 10, 'INSTALLMENT')).toBe('333.30');
    expect(effectiveTotal('1000.00', 10, 'TOTAL')).toBe('1000.00');
  });

  it('sem valor ou com quantidade inválida não há total', () => {
    expect(effectiveTotal(null, 10, 'INSTALLMENT')).toBeNull();
    expect(effectiveTotal('100.00', 0, 'INSTALLMENT')).toBeNull();
    expect(effectiveTotal('100.00', Number.NaN, 'INSTALLMENT')).toBeNull();
  });

  it('detecta total menor que um centavo por parcela', () => {
    expect(belowMinimumPerInstallment('0.05', 10)).toBe(true);
    expect(belowMinimumPerInstallment('0.10', 10)).toBe(false);
  });

  it('resume parcelas iguais com o total e, com resto, separa a primeira', () => {
    expect(installmentSummary('1000.00', 10)).toBe('10 × R$ 100,00 = R$ 1.000,00');
    expect(installmentSummary('333.30', 10)).toBe('10 × R$ 33,33 = R$ 333,30');
    expect(installmentSummary('333.31', 10)).toBe('1 × R$ 33,34 + 9 × R$ 33,33');
  });

  it('134,30 em 4x: a primeira parcela maior e as 3 demais iguais', () => {
    expect(installmentSummary('134.30', 4)).toBe('1 × R$ 33,59 + 3 × R$ 33,57');
  });

  it('modo "Valor da parcela": 33,59 x 4 = 134,36 em 4 parcelas de 33,59, sem resto', () => {
    const total = effectiveTotal('33.59', 4, 'INSTALLMENT');
    expect(total).toBe('134.36');
    expect(installmentSummary(total as string, 4)).toBe('4 × R$ 33,59 = R$ 134,36');
    expect(installmentOverview(total as string, 4)).toEqual({ count: 4, first: '33.59', others: '33.59', hasRemainder: false, total: '134.36' });
  });

  it('devolve vazio quando o total não pode ser dividido', () => {
    expect(installmentSummary('0.05', 10)).toBe('');
  });

  it('o panorama de 10 parcelas iguais não tem resto', () => {
    expect(installmentOverview('1000.00', 10)).toEqual({ count: 10, first: '100.00', others: '100.00', hasRemainder: false, total: '1000.00' });
  });

  it('o resto de centavos fica na primeira parcela', () => {
    expect(installmentOverview('333.31', 10)).toEqual({ count: 10, first: '33.34', others: '33.33', hasRemainder: true, total: '333.31' });
    expect(installmentOverview('134.30', 4)).toEqual({ count: 4, first: '33.59', others: '33.57', hasRemainder: true, total: '134.30' });
  });

  it('no valor mínimo cada parcela fica com R$ 0,01', () => {
    expect(installmentOverview('0.10', 10)).toEqual({ count: 10, first: '0.01', others: '0.01', hasRemainder: false, total: '0.10' });
  });

  it('sem divisão possível ou com quantidade inválida o panorama é nulo', () => {
    expect(installmentOverview('0.05', 10)).toBeNull();
    expect(installmentOverview('100.00', 0)).toBeNull();
    expect(installmentOverview('100.00', Number.NaN)).toBeNull();
    expect(installmentOverview('', 3)).toBeNull();
  });
});
