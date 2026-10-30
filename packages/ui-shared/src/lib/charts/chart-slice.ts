/** Fatia de um gráfico: rótulo, valor monetário como string decimal do contrato e cor. */
export interface ChartSlice {
  label: string;
  value: string;
  color: string;
  /** Ícone opcional (chave do catálogo) mostrado na legenda, como o do cartão. */
  icon?: string;
}
