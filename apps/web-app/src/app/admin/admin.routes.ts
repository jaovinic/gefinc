import { Route } from '@angular/router';
import { AdminLayout } from './admin-layout';

/**
 * Filhas de `/admin`, carregadas sob demanda a partir do `Shell` e já atrás do `adminGuard` (em
 * `app.routes.ts`). O servidor continua sendo a barreira real de cada chamada.
 */
export const adminRoutes: Route[] = [
  {
    path: '',
    component: AdminLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'users' },
      {
        path: 'users',
        loadComponent: () => import('./admin-users-placeholder').then((m) => m.AdminUsersPlaceholder),
      },
    ],
  },
];
