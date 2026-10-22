import { Component } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { ForgotPassword, Login, Register } from '@gefinc/ui-shared';

/** Páginas do Ionic que apenas envolvem as telas de acesso compartilhadas com o web. */
@Component({
  selector: 'gef-login-page',
  imports: [IonContent, Login],
  template: '<ion-content><gef-login /></ion-content>',
})
export class LoginPage {}

@Component({
  selector: 'gef-register-page',
  imports: [IonContent, Register],
  template: '<ion-content><gef-register /></ion-content>',
})
export class RegisterPage {}

@Component({
  selector: 'gef-forgot-password-page',
  imports: [IonContent, ForgotPassword],
  template: '<ion-content><gef-forgot-password /></ion-content>',
})
export class ForgotPasswordPage {}
