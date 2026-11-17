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
      { path: 'invitations', loadComponent: () => import('./invitations/invitations-page').then((m) => m.InvitationsPage) },
      { path: 'audit', loadComponent: () => import('./audit/audit-list').then((m) => m.AuditList) },
      { path: 'email', loadComponent: () => import('./email/email-page').then((m) => m.EmailPage) },
      { path: 'settings', loadComponent: () => import('./settings/settings-page').then((m) => m.SettingsPage) },
      { path: 'deletion-reasons', loadComponent: () => import('./deletion-reasons/reasons-page').then((m) => m.ReasonsPage) },
      { path: 'communications/pending', loadComponent: () => import('./communications/pending-list').then((m) => m.PendingList) },
    ],
  },
];
