import { Route } from '@angular/router';
import { authGuard } from '@gefinc/ui-shared';
import { Shell } from './layout/shell';

/**
 * Rotas públicas (login, cadastro, recuperação) e a área autenticada dentro do {@link Shell}.
 * Cada história acrescenta as suas rotas carregadas sob demanda.
 */
export const appRoutes: Route[] = [
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [],
  },
];
