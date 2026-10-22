import { Component } from '@angular/core';
import { ForgotPassword, Login, Register } from '@gefinc/ui-shared';

/** Páginas que apenas envolvem as telas de acesso compartilhadas com o web em uma tela rolável. */
@Component({
  selector: 'gef-login-page',
  imports: [Login],
  template: '<div class="gef-screen"><gef-login /></div>',
})
export class LoginPage {}

@Component({
  selector: 'gef-register-page',
  imports: [Register],
  template: '<div class="gef-screen"><gef-register /></div>',
})
export class RegisterPage {}

@Component({
  selector: 'gef-forgot-password-page',
  imports: [ForgotPassword],
  template: '<div class="gef-screen"><gef-forgot-password /></div>',
})
export class ForgotPasswordPage {}
