import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '@gefinc/ui-shared';

/** Ação de sair: encerra a sessão (API e armazenamento seguro) e volta ao login. */
@Injectable({ providedIn: 'root' })
export class LogoutAction {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  run(): void {
    this.session.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
