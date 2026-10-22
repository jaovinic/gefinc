import { Route } from '@angular/router';
import {
  DeleteAccount,
  ForgotPassword,
  Login,
  Register,
  ResetPassword,
  AccountsPage,
  CategoriesPage,
  TransactionsPage,
  InvoicesPage,
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
        loadComponent: () => import('./dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'transactions',
        component: TransactionsPage,
      },
      {
        path: 'invoices',
        component: InvoicesPage,
      },
      {
        path: 'cashflow',
        loadComponent: () => import('./invoices/cashflow-page').then((m) => m.CashflowPage),
      },
      {
        path: 'categories',
        component: CategoriesPage,
      },
      {
        path: 'accounts',
        component: AccountsPage,
      },
      {
        path: 'settings',
        component: DeleteAccount,
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
