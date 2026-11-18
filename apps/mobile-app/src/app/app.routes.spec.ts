import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';
import { PrivacyPage } from './auth/privacy.page';

describe('appRoutes (mobile)', () => {
  it('o aviso de privacidade é público: rota /privacidade fora da casca autenticada', () => {
    const route = appRoutes.find((r) => r.path === 'privacidade');

    expect(route?.loadComponent).toBeDefined();
    expect(route?.canActivate).toBeUndefined();
  });

  it('o aviso de privacidade renderiza dentro de .gef-screen para poder rolar em telas baixas', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const route = appRoutes.find((r) => r.path === 'privacidade');
    const page = (await (route?.loadComponent as () => Promise<typeof PrivacyPage>)()) as typeof PrivacyPage;
    const fixture = TestBed.createComponent(page);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.gef-screen [data-testid="privacy-notice"]')).not.toBeNull();
    expect(el.querySelector('.gef-screen a[href="/login"]')).not.toBeNull();
  });
});
