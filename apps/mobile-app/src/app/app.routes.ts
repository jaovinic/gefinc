import { Route } from '@angular/router';
import { AccountsPage, CategoriesPage, InvoicesPage, TransactionsPage, authGuard } from '@gefinc/ui-shared';
import { ForgotPasswordPage, LoginPage, RegisterPage } from './auth/auth-pages';
import { HomePage } from './home/home.page';
import { MobileShell } from './shell/mobile-shell';
import { MorePage } from './shell/more.page';
import { QuickExpensePage } from './quick-expense/quick-expense.page';

/**
 * Rotas públicas (login, cadastro, recuperação de senha), o lançamento rápido em tela cheia e a área
 * autenticada dentro da casca com barra de abas. O link de redefinição de senha abre no web.
 */
export const appRoutes: Route[] = [
  { path: 'login', component: LoginPage },
  { path: 'register', component: RegisterPage },
  { path: 'forgot-password', component: ForgotPasswordPage },
  { path: 'quick-expense', component: QuickExpensePage, canActivate: [authGuard] },
  {
    path: '',
    component: MobileShell,
    canActivate: [authGuard],
    children: [
      { path: '', component: HomePage, pathMatch: 'full' },
      { path: 'mais', component: MorePage },
      { path: 'lancamentos', component: TransactionsPage },
      { path: 'faturas', component: InvoicesPage },
      { path: 'contas', component: AccountsPage },
      { path: 'categorias', component: CategoriesPage },
      // As demais telas (lançamentos, faturas, contas, categorias, fluxo de caixa e minha conta)
      // entram aqui, como rotas filhas, nas histórias seguintes.
    ],
  },
  { path: '**', redirectTo: '' },
];
