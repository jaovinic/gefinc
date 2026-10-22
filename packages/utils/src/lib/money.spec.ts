import {
  addMoney,
  compareMoney,
  formatBRL,
  fromCents,
  isValidMoney,
  splitMoney,
  subMoney,
  sumMoney,
  toCents,
} from './money';

describe('Money', () => {
  describe('toCents / fromCents', () => {
    it('converte strings decimais exatas em centavos e de volta', () => {
      expect(toCents('1234.56')).toBe(123456n);
      expect(toCents('0.05')).toBe(5n);
      expect(toCents('-10.00')).toBe(-1000n);
      expect(fromCents(123456n)).toBe('1234.56');
      expect(fromCents(5n)).toBe('0.05');
      expect(fromCents(-1000n)).toBe('-10.00');
      expect(fromCents(0n)).toBe('0.00');
    });

    it('rejeita valores com mais ou menos de 2 casas, vírgula ou lixo', () => {
      for (const invalid of ['10', '10.5', '10.555', '10,50', '', ' 1.00', '1e3', 'abc', '--1.00', '1.00.00']) {
        expect(isValidMoney(invalid)).toBe(false);
        expect(() => toCents(invalid)).toThrow();
      }
      expect(isValidMoney('0.00')).toBe(true);
    });
  });

  describe('aritmética exata', () => {
    it('soma e subtrai sem erro de ponto flutuante', () => {
      expect(addMoney('0.10', '0.20')).toBe('0.30');
      expect(subMoney('0.30', '0.10')).toBe('0.20');
      expect(subMoney('10.00', '12.50')).toBe('-2.50');
      expect(sumMoney(['33.33', '33.33', '33.34'])).toBe('100.00');
      expect(sumMoney([])).toBe('0.00');
    });

    it('compara valores', () => {
      expect(compareMoney('1.00', '2.00')).toBe(-1);
      expect(compareMoney('2.00', '2.00')).toBe(0);
      expect(compareMoney('3.00', '2.99')).toBe(1);
    });
  });

  describe('splitMoney', () => {
    it('divide em parcelas iguais quando a divisão é exata', () => {
      expect(splitMoney('100.00', 4)).toEqual(['25.00', '25.00', '25.00', '25.00']);
    });

    it('deixa o resto de centavos na última parcela', () => {
      expect(splitMoney('100.00', 3)).toEqual(['33.33', '33.33', '33.34']);
      expect(splitMoney('0.10', 3)).toEqual(['0.03', '0.03', '0.04']);
    });

    it('trata a parcela única', () => {
      expect(splitMoney('59.90', 1)).toEqual(['59.90']);
    });

    it('garante que a soma é igual ao total para vários casos', () => {
      for (const [total, n] of [['999.99', 7], ['1.00', 3], ['10000.01', 12], ['0.01', 1]] as const) {
        expect(sumMoney(splitMoney(total, n))).toBe(total);
      }
    });

    it('rejeita quantidade de parcelas inválida ou total não positivo', () => {
      expect(() => splitMoney('100.00', 0)).toThrow();
      expect(() => splitMoney('100.00', 1.5)).toThrow();
      expect(() => splitMoney('0.00', 2)).toThrow();
      expect(() => splitMoney('0.01', 2)).toThrow();
    });
  });

  describe('formatBRL', () => {
    it('formata em reais com separadores brasileiros', () => {
      expect(formatBRL('0.00')).toBe('R$ 0,00');
      expect(formatBRL('5.07')).toBe('R$ 5,07');
      expect(formatBRL('1234.56')).toBe('R$ 1.234,56');
      expect(formatBRL('1234567.89')).toBe('R$ 1.234.567,89');
    });

    it('formata valores negativos', () => {
      expect(formatBRL('-1234.56')).toBe('-R$ 1.234,56');
    });
  });
});
