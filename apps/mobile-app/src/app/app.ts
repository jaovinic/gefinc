import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IonApp } from '@ionic/angular';
import { AppLockService } from './lock/app-lock.service';
import { LockScreen } from './lock/lock-screen';

@Component({
  imports: [IonApp, LockScreen, RouterOutlet],
  selector: 'gef-root',
  // `router-outlet` comum (e não `ion-router-outlet`): a navegação do app é por abas, sem pilha de telas do
  // Ionic, e a tela anterior não pode ficar no DOM (ids duplicados quebram rótulos e preenchimento).
  template: `
    <ion-app [attr.inert]="lock.locked() ? '' : null" [attr.aria-hidden]="lock.locked() ? 'true' : null"><router-outlet /></ion-app>
    <gef-lock-screen />
  `,
})
export class App {
  protected readonly lock = inject(AppLockService);
}
