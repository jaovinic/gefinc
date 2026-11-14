import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthApi, CurrentUser, SessionService } from '@gefinc/ui-shared';
import { catchError, map, of, tap } from 'rxjs';

/**
 * Barreira de navegação do painel (conveniência: o servidor é quem nega o acesso). Visitante vai ao
 * login; quem está conectado tem o perfil conferido no servidor a cada entrada em `/admin` e só passa
 * se for administrador. Usuário comum, perfil sem o indicador e qualquer falha (rede, servidor) voltam
 * para `/`, sem revelar a área.
 */
export const adminGuard: CanActivateFn = () => {
  const router = inject(Router);
  if (!inject(SessionService).authenticated()) {
    return router.createUrlTree(['/login']);
  }
  const currentUser = inject(CurrentUser);
  return inject(AuthApi)
    .me()
    .pipe(
      // Atualiza o perfil guardado: o menu acompanha a concessão ou a retirada do perfil.
      tap((profile) => currentUser.apply(profile)),
      map((profile) => (profile.admin === true ? true : router.createUrlTree(['/']))),
      catchError(() => of(router.createUrlTree(['/']))),
    );
};
