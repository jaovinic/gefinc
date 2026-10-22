import { Route } from '@angular/router';
import { authGuard } from '@gefinc/ui-shared';
import { ForgotPasswordPage, LoginPage, RegisterPage } from './auth/auth-pages';
import { HomePage } from './home/home.page';
import { QuickExpensePage } from './quick-expense/quick-expense.page';

/**
 * Rotas públicas (login, cadastro, recuperação de senha) e a área autenticada. A tela inicial
 * (`''`) é o ponto de partida do lançamento rápido. O link de redefinição de senha abre no web.
 */
export const appRoutes: Route[] = [
  { path: 'login', component: LoginPage },
  { path: 'register', component: RegisterPage },
  { path: 'forgot-password', component: ForgotPasswordPage },
  { path: '', component: HomePage, canActivate: [authGuard], pathMatch: 'full' },
  { path: 'quick-expense', component: QuickExpensePage, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
