/** Fatia de um gráfico: rótulo, valor monetário como string decimal do contrato e cor. */
export interface ChartSlice {
  label: string;
  value: string;
  color: string;
  /** Ícone opcional (chave do catálogo) mostrado na legenda, como o do cartão. */
  icon?: string;
  /** Cor personalizada da conta (`#RRGGBB`), quando existe: pinta o tile do ícone e a barra no lugar de `color`. */
  colorHex?: string | null;
}
