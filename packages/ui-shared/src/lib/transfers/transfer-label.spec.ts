import { transferLabel } from './transfer-label';

const names: Record<number, string> = { 1: 'Itaú', 2: 'Carteira' };
const nameOf = (id: number) => names[id] ?? '—';
const transfer = { fromAccountId: 1, toAccountId: 2 };

describe('transferLabel', () => {
  it('sem filtro mostra "origem para destino"', () => {
    expect(transferLabel(transfer, 0, nameOf)).toBe('Itaú para Carteira');
  });

  it('filtrando pela origem diz "Transferência para" o destino', () => {
    expect(transferLabel(transfer, 1, nameOf)).toBe('Transferência para Carteira');
  });

  it('filtrando pelo destino diz "Transferência de" a origem', () => {
    expect(transferLabel(transfer, 2, nameOf)).toBe('Transferência de Itaú');
  });

  it('filtro por uma conta que não participa cai no formato "origem para destino"', () => {
    expect(transferLabel(transfer, 9, nameOf)).toBe('Itaú para Carteira');
  });
});
