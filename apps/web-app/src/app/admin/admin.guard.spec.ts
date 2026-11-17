import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { AuthApi, CurrentUser, SessionService } from '@gefinc/ui-shared';
import type { UserProfile } from '@gefinc/core-models';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
import { adminGuard } from './admin.guard';

const profile = (admin?: boolean): UserProfile => ({
  id: 1,
  email: 'ana@example.com',
  name: null,
  createdAt: '2026-01-01T00:00:00Z',
  ...(admin === undefined ? {} : { admin }),
});

describe('adminGuard', () => {
  const authenticated = { value: true };
  const me = jest.fn<Observable<UserProfile>, []>();
  const apply = jest.fn();

  beforeEach(() => {
    authenticated.value = true;
    me.mockReset();
    apply.mockReset();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { authenticated: () => authenticated.value } },
        { provide: AuthApi, useValue: { me } },
        { provide: CurrentUser, useValue: { apply } },
      ],
    });
  });

  function run(): Promise<boolean | UrlTree> {
    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));
    return firstValueFrom(result as Observable<boolean | UrlTree>);
  }

  const target = (result: boolean | UrlTree): string => TestBed.inject(Router).serializeUrl(result as UrlTree);

  it('visitante vai para /login sem consultar o perfil', async () => {
    authenticated.value = false;

    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));

    expect(result instanceof UrlTree).toBe(true);
    expect(target(result as UrlTree)).toBe('/login');
    expect(me).not.toHaveBeenCalled();
  });

  it('administrador entra e o perfil atualizado vai para o usuário atual', async () => {
    me.mockReturnValue(of(profile(true)));

    expect(await run()).toBe(true);
    expect(apply).toHaveBeenCalledWith(profile(true));
  });

  it('usuário comum volta para / sem revelar a área, mas o perfil atualizado é guardado', async () => {
    me.mockReturnValue(of(profile(false)));

    const result = await run();

    expect(result instanceof UrlTree).toBe(true);
    expect(target(result)).toBe('/');
    expect(apply).toHaveBeenCalledWith(profile(false));
  });

  it('perfil sem o indicador admin não passa', async () => {
    me.mockReturnValue(of(profile()));

    expect(target(await run())).toBe('/');
  });

  it('erro de rede ou do servidor volta para / e nunca mostra a área', async () => {
    me.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    expect(target(await run())).toBe('/');

    me.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(target(await run())).toBe('/');
    expect(apply).not.toHaveBeenCalled();
  });

  it('consulta o perfil a cada entrada em /admin (papel retirado vale na hora)', async () => {
    me.mockReturnValueOnce(of(profile(true))).mockReturnValueOnce(of(profile(false)));

    expect(await run()).toBe(true);
    expect(target(await run())).toBe('/');
    expect(me).toHaveBeenCalledTimes(2);
  });
});
