/**
 * Dinheiro como string decimal com exatamente 2 casas ("1234.56"), a mesma representação do contrato
 * da API. A aritmética usa centavos em `bigint`, nunca `number` de ponto flutuante (Princípio II).
 */

const MONEY_PATTERN = /^-?\d+\.\d{2}$/;

export function isValidMoney(value: string): boolean {
  return MONEY_PATTERN.test(value);
}

export function toCents(value: string): bigint {
  if (!isValidMoney(value)) {
    throw new Error(`Valor monetário inválido: "${value}"`);
  }
  const negative = value.startsWith('-');
  const [integer, fraction] = (negative ? value.slice(1) : value).split('.');
  const cents = BigInt(integer) * 100n + BigInt(fraction);
  return negative ? -cents : cents;
}

export function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const integer = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${integer}.${fraction}`;
}

export function addMoney(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}

export function subMoney(a: string, b: string): string {
  return fromCents(toCents(a) - toCents(b));
}

export function sumMoney(values: readonly string[]): string {
  return fromCents(values.reduce((total, value) => total + toCents(value), 0n));
}

export function compareMoney(a: string, b: string): -1 | 0 | 1 {
  const left = toCents(a);
  const right = toCents(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Multiplica um valor por um fator inteiro (ex.: valor da parcela × número de parcelas), em centavos
 * com `bigint`, sem perda de precisão.
 */
export function multiplyMoney(value: string, factor: number): string {
  if (!Number.isInteger(factor) || factor < 1) {
    throw new Error(`Fator de multiplicação inválido: ${factor}`);
  }
  return fromCents(toCents(value) * BigInt(factor));
}

/**
 * Divide o total em `count` parcelas de valor inteiro em centavos: `base = floor(centavos / count)`; a
 * primeira parcela recebe `base` mais todo o resto da divisão e as demais recebem `base` (convenção das
 * adquirentes: 134,30 em 4x = 33,59 + 3 × 33,57). A soma é sempre exatamente igual ao total (FR-023).
 * Mesma regra de `InstallmentScheduler.split`, validada pelos vetores `split` de
 * `packages/core-models/fixtures/installments.json`.
 */
export function splitMoney(total: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Quantidade de parcelas inválida: ${count}`);
  }
  const cents = toCents(total);
  if (cents <= 0n || cents < BigInt(count)) {
    throw new Error(`O total "${total}" não pode ser dividido em ${count} parcelas`);
  }
  const base = cents / BigInt(count);
  const parts = Array.from({ length: count }, () => base);
  parts[0] = cents - base * BigInt(count - 1);
  return parts.map(fromCents);
}

/** Formata em reais: "R$ 1.234,56"; valores negativos viram "-R$ 1.234,56". */
export function formatBRL(value: string): string {
  const cents = toCents(value);
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const integer = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}R$ ${integer},${fraction}`;
}
