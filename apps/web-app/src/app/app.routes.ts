import { Route } from '@angular/router';
import {
  ProfilePage,
  ForgotPassword,
  Login,
  Register,
  ResetPassword,
  DashboardPage,
  authGuard,
} from '@gefinc/ui-shared';
import { Shell } from './layout/shell';

/**
 * Rotas públicas (login, cadastro, recuperação de senha) e a área autenticada dentro do {@link Shell}.
 * Cada história acrescenta as suas rotas, carregadas sob demanda.
 */
export const appRoutes: Route[] = [
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  {
    path: 'forgot-password',
    component: ForgotPassword,
  },
  {
    path: 'reset-password',
    component: ResetPassword,
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        component: DashboardPage,
      },
      {
        path: 'transactions',
        loadComponent: () => import('@gefinc/ui-shared/pages').then((m) => m.TransactionsPage),
      },
      {
        path: 'invoices',
        loadComponent: () => import('@gefinc/ui-shared/pages').then((m) => m.InvoicesPage),
      },
      {
        path: 'cashflow',
        loadComponent: () => import('@gefinc/ui-shared/pages').then((m) => m.CashflowPage),
      },
      {
        path: 'categories',
        loadComponent: () => import('@gefinc/ui-shared/pages').then((m) => m.CategoriesPage),
      },
      {
        path: 'accounts',
        loadComponent: () => import('@gefinc/ui-shared/pages').then((m) => m.AccountsPage),
      },
      {
        path: 'transfers',
        loadComponent: () => import('@gefinc/ui-shared/pages').then((m) => m.TransfersPage),
      },
      {
        path: 'settings',
        component: ProfilePage,
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
