/** Área do sistema no menu: ícone, nome e as rotas do web e do app (que usam caminhos diferentes). */
export interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  readonly web: string;
  readonly app: string;
}

/** Fonte única dos itens de navegação, usada pelo menu lateral do web e pelo menu "Mais" do app. */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'dashboard', label: 'Painel', icon: 'dashboard', web: '/', app: '/' },
  { key: 'transactions', label: 'Lançamentos', icon: 'list', web: '/transactions', app: '/lancamentos' },
  { key: 'invoices', label: 'Faturas', icon: 'invoice', web: '/invoices', app: '/faturas' },
  { key: 'cashflow', label: 'Fluxo de caixa', icon: 'cashflow', web: '/cashflow', app: '/fluxo-de-caixa' },
  { key: 'accounts', label: 'Contas e cartões', icon: 'accounts', web: '/accounts', app: '/contas' },
  { key: 'transfers', label: 'Transferências', icon: 'transfer', web: '/transfers', app: '/transferencias' },
  { key: 'categories', label: 'Categorias', icon: 'tag', web: '/categories', app: '/categorias' },
  { key: 'settings', label: 'Minha conta', icon: 'user', web: '/settings', app: '/minha-conta' },
];
