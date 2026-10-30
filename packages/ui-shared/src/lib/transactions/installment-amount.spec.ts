import { belowMinimumPerInstallment, effectiveTotal, installmentSummary } from './installment-amount';

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

  it('resume parcelas iguais com o total e, com resto, separa a última', () => {
    expect(installmentSummary('1000.00', 10)).toBe('10 × R$ 100,00 = R$ 1.000,00');
    expect(installmentSummary('333.30', 10)).toBe('10 × R$ 33,33 = R$ 333,30');
    expect(installmentSummary('333.31', 10)).toBe('9 × R$ 33,33 + 1 × R$ 33,34');
  });

  it('devolve vazio quando o total não pode ser dividido', () => {
    expect(installmentSummary('0.05', 10)).toBe('');
  });
});
