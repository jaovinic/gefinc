import { incomeDateHint } from './income-hint';

describe('incomeDateHint', () => {
  const today = '2026-11-10';

  it('data de hoje entra na conta hoje', () => {
    expect(incomeDateHint('2026-11-10', today)).toBe('Entra na conta hoje');
  });

  it('data passada entra na conta na data informada', () => {
    expect(incomeDateHint('2026-11-02', today)).toBe('Entra na conta na data informada');
  });

  it('data futura fica a receber até a data', () => {
    expect(incomeDateHint('2026-12-25', today)).toBe('Fica a receber até 25/12/2026');
  });

  it('sem data não mostra dica', () => {
    expect(incomeDateHint('', today)).toBe('');
  });
});
