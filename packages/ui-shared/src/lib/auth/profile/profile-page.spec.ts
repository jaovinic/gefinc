import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CurrentUser, SessionService, TokenStore } from '../../api';
import { API, configureAuthTesting, type } from '../testing/auth-testing';
import { ProfilePage } from './profile-page';

describe('ProfilePage (Minha conta)', () => {
  async function setup(name: string | null = 'Ana Souza') {
    const ctx = configureAuthTesting();
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    ctx.http.expectOne(`${API}/auth/me`).flush({ id: 1, email: 'ana@example.com', name, createdAt: '2026-01-01T00:00:00Z' });
    fixture.detectChanges();
    await fixture.whenStable();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  const submitForm = (el: HTMLElement, field: string) =>
    (el.querySelector(field)!.closest('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('mostra o nome e o e-mail no cabeçalho, com a inicial do nome', async () => {
    const { el } = await setup();
    expect(el.querySelector('[data-testid="profile-name"]')?.textContent).toContain('Ana Souza');
    expect(el.querySelector('[data-testid="profile-email"]')?.textContent).toContain('ana@example.com');
    expect(el.querySelector('[data-testid="profile-header"] span[aria-hidden="true"]')?.textContent?.trim()).toBe('A');
    expect((el.querySelector('#profile-email-input') as HTMLInputElement).readOnly).toBe(true);
  });

  it('a seção Aparência reúne o tema e o interruptor de desfoque (vidro)', async () => {
    const { el } = await setup();
    const section = el.querySelector('section[aria-labelledby="appearance-title"]') as HTMLElement;
    expect(section.querySelector('[role="radiogroup"]')).not.toBeNull();
    const glass = section.querySelector('input[role="switch"]') as HTMLInputElement;
    expect(glass.closest('label')?.textContent).toContain('Desfoque (vidro)');
    expect(glass.checked).toBe(true);
  });

  it('sem nome cadastrado usa a inicial do e-mail', async () => {
    const { el } = await setup(null);
    expect(el.querySelector('[data-testid="profile-name"]')?.textContent).toContain('Sem nome');
    expect(el.querySelector('[data-testid="profile-header"] span[aria-hidden="true"]')?.textContent?.trim()).toBe('A');
  });

  it('ao abrir, entrega o perfil ao atalho Minha conta (sem nova chamada)', async () => {
    await setup('Ana Souza');
    const user = TestBed.inject(CurrentUser);
    expect(user.profile()?.email).toBe('ana@example.com');
    expect(user.displayName()).toBe('Ana Souza');
  });

  it('o botão de salvar o nome só habilita depois de mudar o nome', async () => {
    const { el, fixture } = await setup();
    const save = () => Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Salvar nome')) as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    type(el, '#profile-name-input', 'Ana Maria');
    fixture.detectChanges();
    expect(save().disabled).toBe(false);
  });

  it('salva o nome e atualiza o cabeçalho', async () => {
    const { el, fixture, http } = await setup();
    type(el, '#profile-name-input', 'Ana Maria');
    fixture.detectChanges();
    submitForm(el, '#profile-name-input');

    const request = http.expectOne(`${API}/auth/me`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ name: 'Ana Maria' });
    request.flush({ id: 1, email: 'ana@example.com', name: 'Ana Maria', createdAt: '2026-01-01T00:00:00Z' });
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="profile-name"]')?.textContent).toContain('Ana Maria');
    expect(TestBed.inject(CurrentUser).profile()?.name).toBe('Ana Maria');
    expect(TestBed.inject(CurrentUser).displayName()).toBe('Ana Maria');
  });

  it('trocar a senha exige confirmação igual e segue a política', async () => {
    const { el, fixture } = await setup();
    type(el, '#current-password', 'senha-forte-123');
    type(el, '#new-password', 'curta');
    type(el, '#confirm-password', 'outra');
    submitForm(el, '#new-password');
    fixture.detectChanges();

    expect(el.textContent).toContain('As senhas não conferem.');
    expect(el.querySelector('#new-password')?.parentElement?.querySelector('.gef-field-error')).not.toBeNull();
  });

  it('troca a senha, adota a sessão nova e limpa o formulário', async () => {
    const { el, fixture, http } = await setup();
    type(el, '#current-password', 'senha-forte-123');
    type(el, '#new-password', 'outra-senha-forte-456');
    type(el, '#confirm-password', 'outra-senha-forte-456');
    submitForm(el, '#new-password');

    const request = http.expectOne(`${API}/auth/password`);
    expect(request.request.body).toEqual({ currentPassword: 'senha-forte-123', newPassword: 'outra-senha-forte-456' });
    expect(request.request.headers.get('X-Client')).toBe('web');
    request.flush({ accessToken: 'novo-token', expiresIn: 900 });
    fixture.detectChanges();

    expect(TestBed.inject(TokenStore).accessToken()).toBe('novo-token');
    expect(TestBed.inject(SessionService).authenticated()).toBe(true);
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Senha alterada.');
    expect((el.querySelector('#current-password') as HTMLInputElement).value).toBe('');
  });

  it('senha atual incorreta aparece no campo, sem derrubar a sessão', async () => {
    const { el, fixture, http } = await setup();
    TestBed.inject(SessionService).authenticated.set(true);
    type(el, '#current-password', 'errada-errada');
    type(el, '#new-password', 'outra-senha-forte-456');
    type(el, '#confirm-password', 'outra-senha-forte-456');
    submitForm(el, '#new-password');

    http.expectOne(`${API}/auth/password`).flush(
      { code: 'VALIDATION_ERROR', errors: [{ field: 'currentPassword', message: 'A senha atual está incorreta.' }] },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('A senha atual está incorreta.');
    expect(TestBed.inject(SessionService).authenticated()).toBe(true);
  });
});
