import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';

/** Só deixa passar quem tem sessão; os demais vão para `/login`. */
export const authGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  return session.authenticated() ? true : inject(Router).createUrlTree(['/login']);
};
