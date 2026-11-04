import { inject } from '@angular/core';
import { Route, Router } from '@angular/router';
import { authGuard } from '@gefinc/ui-shared';
import { ForgotPasswordPage, LoginPage, RegisterPage } from './auth/auth-pages';
import { HomePage } from './home/home.page';
import { MobileShell } from './shell/mobile-shell';

/**
 * Rotas públicas (login, cadastro, recuperação de senha), o novo lançamento em tela cheia e a área
 * autenticada dentro da casca com barra de abas. O link de redefinição de senha abre no web.
 */
export const appRoutes: Route[] = [
  { path: 'login', component: LoginPage },
  { path: 'register', component: RegisterPage },
  { path: 'forgot-password', component: ForgotPasswordPage },
  { path: 'novo', loadComponent: () => import('./new-entry/new-entry.page').then((m) => m.NewEntryPage), canActivate: [authGuard] },
  // Endereços antigos (atalhos e lembretes já gravados) levam ao novo lançamento na natureza certa.
  { path: 'quick-expense', redirectTo: () => inject(Router).parseUrl('/novo?tipo=despesa') },
  { path: 'quick-income', redirectTo: () => inject(Router).parseUrl('/novo?tipo=receita') },
  {
    path: '',
    component: MobileShell,
    canActivate: [authGuard],
    children: [
      { path: '', component: HomePage, pathMatch: 'full' },
      // O antigo menu Mais virou um painel aberto pelo atalho Minha conta: o endereço volta ao painel.
      { path: 'mais', redirectTo: '', pathMatch: 'full' },
      { path: 'lancamentos', loadComponent: () => import('@gefinc/ui-shared/pages').then((m) => m.TransactionsPage) },
      { path: 'faturas', loadComponent: () => import('@gefinc/ui-shared/pages').then((m) => m.InvoicesPage) },
      { path: 'fluxo-de-caixa', loadComponent: () => import('@gefinc/ui-shared/pages').then((m) => m.CashflowPage) },
      { path: 'minha-conta', loadComponent: () => import('./settings/settings.page').then((m) => m.SettingsPage) },
      { path: 'pendencias', loadComponent: () => import('./offline/pending-list.page').then((m) => m.PendingListPage) },
      { path: 'contas', loadComponent: () => import('@gefinc/ui-shared/pages').then((m) => m.AccountsPage) },
      { path: 'categorias', loadComponent: () => import('@gefinc/ui-shared/pages').then((m) => m.CategoriesPage) },
      // As demais telas (lançamentos, faturas, contas, categorias, fluxo de caixa e minha conta)
      // entram aqui, como rotas filhas, nas histórias seguintes.
    ],
  },
  { path: '**', redirectTo: '' },
];
