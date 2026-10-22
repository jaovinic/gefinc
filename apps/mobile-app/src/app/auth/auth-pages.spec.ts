import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL, CLIENT_KIND, MemoryTokenStore, TokenStore } from '@gefinc/ui-shared';
import { ForgotPasswordPage, LoginPage, RegisterPage } from './auth-pages';

describe('páginas de acesso do app móvel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api/v1' },
        { provide: CLIENT_KIND, useValue: 'mobile' },
        { provide: TokenStore, useClass: MemoryTokenStore },
      ],
    });
  });

  it.each([
    [LoginPage, 'Entrar'],
    [RegisterPage, 'Criar conta'],
    [ForgotPasswordPage, 'Recuperar senha'],
  ])('%p mostra a tela compartilhada dentro do ion-content', async (page, heading) => {
    const fixture = TestBed.createComponent(page);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('ion-content')).not.toBeNull();
    expect(el.textContent).toContain(heading);
  });
});
