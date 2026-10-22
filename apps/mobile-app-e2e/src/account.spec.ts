import { APIRequestContext, expect, test } from '@playwright/test';
import { API, PASSWORD, newUser, openFromMore, signIn } from './support';

const MAILPIT = 'http://localhost:8025/api/v1';

async function messageTo(request: APIRequestContext, email: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = await (await request.get(`${MAILPIT}/messages`)).json();
    const found = (list.messages ?? []).find((m: { To: { Address: string }[] }) => m.To.some((t) => t.Address === email));
    if (found) {
      return (await request.get(`${MAILPIT}/message/${found.ID}`)).json();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`E-mail não chegou para ${email}`);
}

test.describe('conta e acesso no celular', () => {
  test('recuperação de senha dá a mesma resposta para e-mail cadastrado ou não e explica o link', async ({ page, request }) => {
    const user = await newUser(request);
    for (const email of [user.email, 'ninguem.cadastrado@example.com']) {
      await page.goto('/forgot-password');
      await page.getByLabel('E-mail cadastrado').fill(email);
      await page.getByRole('button', { name: 'Enviar link' }).click();
      await expect(page.getByRole('status')).toContainText('Se o e-mail estiver cadastrado');
      await expect(page.getByRole('status')).toContainText('abre no navegador');
    }
    // o e-mail só chega para quem existe
    const message = await messageTo(request, user.email);
    expect(message.Text).toContain('reset-password?token=');
  });

  test('exclusão da conta: pede a senha, agenda 30 dias, encerra a sessão e o login permite cancelar', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    await openFromMore(page, 'Minha conta');
    await expect(page.getByRole('heading', { name: 'Minha conta' })).toBeVisible();

    // senha errada não agenda
    await page.getByLabel('Confirme com a sua senha').fill('senha-errada-123');
    await page.getByRole('button', { name: 'Excluir minha conta' }).click();
    await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos.');

    await page.getByLabel('Confirme com a sua senha').fill(PASSWORD);
    await page.getByRole('button', { name: 'Excluir minha conta' }).click();
    await expect(page.getByRole('status')).toContainText('Exclusão agendada para');

    // sessões encerradas: o token antigo não vale mais
    const after = await request.get(`${API}/accounts`, { headers: user.headers });
    expect(after.status()).toBe(401);

    // entrar dentro da carência oferece cancelar a exclusão
    await page.getByRole('button', { name: 'Ir para o login' }).click();
    await page.getByLabel('E-mail').fill(user.email);
    await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByText(/exclusão/i).first()).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar a exclusão e entrar' }).click();
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
  });

  test('sair encerra a sessão e leva ao login', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);

    await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Mais' }).click();
    await page.getByRole('main').getByRole('button', { name: 'Sair' }).click();

    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  });
});
