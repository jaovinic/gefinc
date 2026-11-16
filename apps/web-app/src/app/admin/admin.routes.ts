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
      { path: 'users', loadComponent: () => import('./users/user-list').then((m) => m.UserList) },
      { path: 'users/:id', loadComponent: () => import('./users/user-detail').then((m) => m.UserDetail) },
      { path: 'audit', loadComponent: () => import('./audit/audit-list').then((m) => m.AuditList) },
    ],
  },
];
