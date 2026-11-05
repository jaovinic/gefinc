/** Um traço do desenho: caminho SVG em grade 24x24, com preenchimento opcional. */
export interface IconPath {
  readonly d: string;
  readonly fill?: string;
}

const p = (d: string, fill?: string): IconPath => (fill ? { d, fill } : { d });
const card = (fill: string): IconPath[] => [p('M3 6h18v12H3z', fill), p('M3 10h18M7 15h4')];

/**
 * Conjunto único de ícones do GEFINC (traço de 1,75 px, pontas arredondadas, `currentColor`):
 * contas e cartões, navegação, ações, natureza (receita/despesa) e status. Sem dependências externas
 * e sem marcas registradas; as chaves de conta são as do contrato (`ACCOUNT_ICONS`).
 */
export const ICON_SET: Readonly<Record<string, readonly IconPath[]>> = {
  // contas e cartões
  bank: [p('M3 9.5 12 4l9 5.5zM5.5 12v6M10 12v6M14 12v6M18.5 12v6M3 21h18')],
  building: [p('M5 21V4h9v17M14 9h5v12M9 8h1M9 12h1M9 16h1M17 13h.01M17 17h.01M3 21h18')],
  briefcase: [p('M4 8h16v12H4zM9 8V5h6v3M4 13h16')],
  landmark: [p('M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6M12 9h.01')],
  wallet: [p('M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h11M16 14h2')],
  cash: [p('M3 7h18v10H3zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 10h.01M18 14h.01')],
  piggy: [p('M5 11a7 6 0 0 1 12-3h2l1 3h2v3h-2l-1 3v2h-3v-2H9v2H6v-3a5 5 0 0 1-1-5zM16 11h.01M3 11l1-2')],
  card: card('none'),
  'card-gold': card('#F5B942'),
  'card-platinum': card('#CBD5E1'),
  'card-black': card('#0F172A'),
  shield: [p('M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM9 12l2 2 4-4')],
  rocket: [p('M5 19c0-4 2-7 5-9l4-3c3 1 5 3 6 6l-3 4c-2 3-5 5-9 5zM9 15l-4 4M15 9h.01')],
  star: [p('m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.1 9.5l6.1-.9z')],
  globe: [p('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18')],
  'shopping-bag': [p('M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2')],

  // navegação
  home: [p('M3 11 12 3l9 8M5 10v10h14V10M10 20v-6h4v6')],
  dashboard: [p('M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z')],
  list: [p('M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6')],
  invoice: [p('M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6')],
  cashflow: [p('M3 20h18M5 16l4-5 4 3 6-8M15 6h4v4')],
  accounts: [p('M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h11M16 14h2')],
  transfer: [p('M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4')],
  tag: [p('M3 12V4h8l10 10-8 8zM7.5 8.5h.01')],
  user: [p('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0')],
  logout: [p('M9 4H5v16h4M16 8l4 4-4 4M20 12H9')],
  menu: [p('M4 6h16M4 12h16M4 18h16')],
  close: [p('M6 6l12 12M18 6 6 18')],
  'chevron-left': [p('m15 6-6 6 6 6')],
  'chevron-right': [p('m9 6 6 6-6 6')],
  'chevron-down': [p('m6 9 6 6 6-6')],

  // ações
  plus: [p('M12 5v14M5 12h14')],
  trash: [p('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6')],
  edit: [p('M4 20h4L19 9l-4-4L4 16zM13 7l4 4')],
  undo: [p('M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3')],
  more: [p('M5 12h.01M12 12h.01M19 12h.01')],
  filter: [p('M3 5h18l-7 8v6l-4-2v-4z')],
  search: [p('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5')],

  // aparência
  sun: [p('M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4')],
  moon: [p('M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z')],
  monitor: [p('M3 4h18v12H3zM8 20h8M12 16v4')],

  calendar: [p('M4 6h16v15H4zM4 10h16M8 3v4M16 3v4')],

  // natureza e status
  'arrow-up': [p('M12 19V5M6 11l6-6 6 6')],
  'arrow-down': [p('M12 5v14M6 13l6 6 6-6')],
  check: [p('m5 12 5 5 9-10')],
  clock: [p('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2')],
  alert: [p('M12 3 2 20h20zM12 10v5M12 18h.01')],
  info: [p('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01')],
  inbox: [p('M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5')],
  'wifi-off': [p('M3 3l18 18M4 9.5a12 12 0 0 1 4-2.4M20 9.5a12 12 0 0 0-8-3.4M7 13a7 7 0 0 1 3-1.8M17 13a7 7 0 0 0-2-1.6M9.5 16.5a3.5 3.5 0 0 1 5 0M12 20h.01')],
};

export const ICON_NAMES: readonly string[] = Object.keys(ICON_SET);

const FALLBACK = 'wallet';

/** Desenho de um ícone pela chave; chave ausente ou desconhecida usa o ícone padrão. */
export function iconPaths(name: string | null | undefined): readonly IconPath[] {
  return (name ? ICON_SET[name] : undefined) ?? ICON_SET[FALLBACK];
}

/** Nomes em português dos ícones de conta e cartão, usados como rótulo acessível ao escolher. */
export const ACCOUNT_ICON_LABELS: Readonly<Record<string, string>> = {
  bank: 'Banco',
  building: 'Empresa',
  briefcase: 'Maleta',
  landmark: 'Casa',
  wallet: 'Carteira',
  cash: 'Dinheiro',
  piggy: 'Cofrinho',
  card: 'Cartão',
  'card-gold': 'Cartão ouro',
  'card-platinum': 'Cartão platinum',
  'card-black': 'Cartão black',
  shield: 'Escudo',
  rocket: 'Foguete',
  star: 'Estrela',
  globe: 'Mundo',
  'shopping-bag': 'Compras',
};
