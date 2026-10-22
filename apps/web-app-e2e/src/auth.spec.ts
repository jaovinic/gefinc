import { APIRequestContext, Page, expect, test } from '@playwright/test';

const MAILPIT = 'http://localhost:8025/api/v1';
const PASSWORD = 'senha-forte-123';

function uniqueEmail(): string {
  return `ana.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function register(page: Page, email: string, password = PASSWORD) {
  await page.goto('/register');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByLabel('Confirme a senha').fill(password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Tudo pronto para começar')).toBeVisible();
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

/** Procura no Mailpit o link de redefinição enviado a este e-mail. */
async function resetLinkFor(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = await (await request.get(`${MAILPIT}/messages`)).json();
    const message = (list.messages ?? []).find((m: { To: { Address: string }[] }) =>
      m.To.some((t) => t.Address === email),
    );
    if (message) {
      const detail = await (await request.get(`${MAILPIT}/message/${message.ID}`)).json();
      const match = /http:\/\/localhost:4200\/reset-password\?token=[A-Za-z0-9_-]+/.exec(detail.Text);
      if (match) {
        return match[0];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`E-mail de redefinição não chegou para ${email}`);
}

test.describe('acesso seguro', () => {
  test('cadastra, entra automaticamente, sai e entra de novo', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);

    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await login(page, email, PASSWORD);
    await expect(page.getByText('Tudo pronto para começar')).toBeVisible();
  });

  test('credenciais erradas mostram mensagem genérica e rota protegida redireciona ao login', async ({ page }) => {
    await login(page, 'ninguem@example.com', 'senha-errada-123');
    await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos.');

    await page.goto('/account');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('recupera a senha pelo link recebido por e-mail', async ({ page, request }) => {
    const email = uniqueEmail();
    await register(page, email);
    await page.getByRole('button', { name: 'Sair' }).click();

    await page.goto('/forgot-password');
    await page.getByLabel('E-mail cadastrado').fill(email);
    await page.getByRole('button', { name: 'Enviar link' }).click();
    await expect(page.getByRole('status')).toContainText('Se o e-mail estiver cadastrado');

    const link = await resetLinkFor(request, email);
    await page.goto(link);
    await page.getByLabel('Nova senha', { exact: true }).fill('nova-senha-segura-456');
    await page.getByLabel('Confirme a nova senha').fill('nova-senha-segura-456');
    await page.getByRole('button', { name: 'Alterar senha' }).click();
    await expect(page.getByRole('status')).toContainText('Senha alterada');

    await login(page, email, PASSWORD);
    await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos.');
    await login(page, email, 'nova-senha-segura-456');
    await expect(page.getByText('Tudo pronto para começar')).toBeVisible();

    // o link é de uso único
    await page.goto(link);
    await page.getByLabel('Nova senha', { exact: true }).fill('outra-senha-segura-789');
    await page.getByLabel('Confirme a nova senha').fill('outra-senha-segura-789');
    await page.getByRole('button', { name: 'Alterar senha' }).click();
    await expect(page.getByRole('alert')).toContainText('inválido, já foi usado ou expirou');
  });

  test('agenda a exclusão da conta e permite cancelá-la ao entrar de novo', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);

    await page.getByRole('link', { name: 'Conta' }).click();
    await page.getByLabel('Confirme com a sua senha').fill(PASSWORD);
    await page.getByRole('button', { name: 'Excluir minha conta' }).click();
    await expect(page.getByRole('status')).toContainText('Exclusão agendada para');

    await login(page, email, PASSWORD);
    await expect(page.getByText('A exclusão desta conta está agendada para')).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar a exclusão e entrar' }).click();
    await expect(page.getByText('Tudo pronto para começar')).toBeVisible();
  });
});
