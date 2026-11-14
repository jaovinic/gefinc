/** Item do menu de administração (só o web; o app móvel nunca mostra o painel). */
export interface AdminNavItem {
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  readonly web: string;
}

/** Nome do grupo no menu lateral e título do painel. */
export const ADMIN_NAV_LABEL = 'Administração';

/** Áreas do painel, fora do `NAV_ITEMS` compartilhado: cada história acrescenta a sua. */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [{ key: 'users', label: 'Usuários', icon: 'users', web: '/admin/users' }];
