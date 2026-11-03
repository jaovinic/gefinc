import { inject } from '@angular/core';
import { Route, Router } from '@angular/router';
import { AccountsPage, CashflowPage, CategoriesPage, InvoicesPage, TransactionsPage, authGuard } from '@gefinc/ui-shared';
import { ForgotPasswordPage, LoginPage, RegisterPage } from './auth/auth-pages';
import { HomePage } from './home/home.page';
import { MobileShell } from './shell/mobile-shell';
import { PendingListPage } from './offline/pending-list.page';
import { SettingsPage } from './settings/settings.page';
import { NewEntryPage } from './new-entry/new-entry.page';

/**
 * Rotas públicas (login, cadastro, recuperação de senha), o novo lançamento em tela cheia e a área
 * autenticada dentro da casca com barra de abas. O link de redefinição de senha abre no web.
 */
export const appRoutes: Route[] = [
  { path: 'login', component: LoginPage },
  { path: 'register', component: RegisterPage },
  { path: 'forgot-password', component: ForgotPasswordPage },
  { path: 'novo', component: NewEntryPage, canActivate: [authGuard] },
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
      { path: 'lancamentos', component: TransactionsPage },
      { path: 'faturas', component: InvoicesPage },
      { path: 'fluxo-de-caixa', component: CashflowPage },
      { path: 'minha-conta', component: SettingsPage },
      { path: 'pendencias', component: PendingListPage },
      { path: 'contas', component: AccountsPage },
      { path: 'categorias', component: CategoriesPage },
      // As demais telas (lançamentos, faturas, contas, categorias, fluxo de caixa e minha conta)
      // entram aqui, como rotas filhas, nas histórias seguintes.
    ],
  },
  { path: '**', redirectTo: '' },
];
