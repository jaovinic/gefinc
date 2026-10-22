import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHost } from '@gefinc/ui-shared';

@Component({
  imports: [RouterOutlet, ToastHost],
  selector: 'gef-root',
  template: '<router-outlet /><gef-toast-host />',
})
export class App {}
