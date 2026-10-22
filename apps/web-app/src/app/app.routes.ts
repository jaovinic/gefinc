import { Route } from '@angular/router';
import {
  DeleteAccount,
  ForgotPassword,
  Login,
  Register,
  ResetPassword,
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
      { path: '', pathMatch: 'full', loadComponent: () => import('./home/home').then((m) => m.Home) },
      {
        path: 'transactions',
        loadComponent: () => import('./transactions/transactions-page').then((m) => m.TransactionsPage),
      },
      {
        path: 'categories',
        loadComponent: () => import('./categories/categories-page').then((m) => m.CategoriesPage),
      },
      {
        path: 'accounts',
        loadComponent: () => import('./accounts/accounts-page').then((m) => m.AccountsPage),
      },
      {
        path: 'settings',
        component: DeleteAccount,
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
