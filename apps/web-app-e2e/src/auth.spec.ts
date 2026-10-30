import { expect, test } from '@playwright/test';
import { PASSWORD, login, register, resetLinkFor, uniqueEmail } from './support';

test.describe('acesso seguro', () => {
  test('cadastra, entra automaticamente, sai e entra de novo', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);

    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await login(page, email, PASSWORD);
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
  });

  test('credenciais erradas mostram mensagem genérica e rota protegida redireciona ao login', async ({ page }) => {
    await login(page, 'ninguem@example.com', 'senha-errada-123');
    await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos.');

    await page.goto('/settings');
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
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();

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

    await page.getByTestId('sidenav').getByRole('link', { name: 'Minha conta', exact: true }).click();
    await page.getByLabel('Confirme com a sua senha').fill(PASSWORD);
    await page.getByRole('button', { name: 'Excluir minha conta' }).click();
    await expect(page.getByRole('status')).toContainText('Exclusão agendada para');

    await login(page, email, PASSWORD);
    await expect(page.getByText('A exclusão desta conta está agendada para')).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar a exclusão e entrar' }).click();
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
  });
});
