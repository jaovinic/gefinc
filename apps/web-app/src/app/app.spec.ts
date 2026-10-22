import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL, CLIENT_KIND, MemoryTokenStore, NoticeService, SessionService, TokenStore } from '@gefinc/ui-shared';
import { App } from './app';
import { Shell } from './layout/shell';

describe('App web', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([{ path: '', component: Shell }, { path: 'login', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1' },
        { provide: CLIENT_KIND, useValue: 'web' },
        { provide: TokenStore, useClass: MemoryTokenStore },
      ],
    });
  });

  it('cria o aplicativo', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });

  it('mostra o cabeçalho, o botão de sair e o aviso de conflito', async () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('GEFINC');
    expect(el.textContent).toContain('Sair');

    TestBed.inject(NoticeService).staleVersion();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('outro dispositivo');
  });

  it('sair encerra a sessão local', async () => {
    const session = TestBed.inject(SessionService);
    session.authenticated.set(true);
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
