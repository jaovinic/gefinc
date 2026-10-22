import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IonApp } from '@ionic/angular';

@Component({
  imports: [IonApp, RouterOutlet],
  selector: 'gef-root',
  // `router-outlet` comum (e não `ion-router-outlet`): a navegação do app é por abas, sem pilha de telas do
  // Ionic, e a tela anterior não pode ficar no DOM (ids duplicados quebram rótulos e preenchimento).
  template: '<ion-app><router-outlet /></ion-app>',
})
export class App {}
