import { expect, test } from '@playwright/test';
import { apiPost, chooseAccount, chooseOption, newUser, openTab, signIn } from './support';

test.describe('modo de manutenção no aplicativo móvel', () => {
  test('exibe o banner de manutenção amigável quando o sistema entra em manutenção', async ({
    page,
    request,
  }) => {
    // Intercepta a consulta de status informando manutenção ativa
    await page.route('**/system/status', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          maintenance: true,
          message: 'Manutenção programada até 14h. Seus dados estão seguros.',
          signupsOpen: true,
        }),
      });
    });

    const user = await newUser(request);
    await signIn(page, user.email);

    // O banner de manutenção deve estar visível com a mensagem do servidor
    const banner = page.getByTestId('maintenance-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Sistema em manutenção');
    await expect(banner).toContainText('Manutenção programada até 14h. Seus dados estão seguros.');
  });

  test('não exibe o banner quando o sistema opera normalmente', async ({ page, request }) => {
    await page.route('**/system/status', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          maintenance: false,
          signupsOpen: true,
        }),
      });
    });

    const user = await newUser(request);
    await signIn(page, user.email);

    const banner = page.getByTestId('maintenance-banner');
    await expect(banner).toHaveCount(0);
  });

  test('lançamento tentado durante a manutenção mostra o aviso, mantém o que foi digitado e é registrado ao repetir depois do término', async ({
    page,
    request,
  }) => {
    let inMaintenance = true;

    await page.route('**/system/status', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          maintenance: inMaintenance,
          message: 'Manutenção programada.',
          signupsOpen: true,
        }),
      });
    });

    await page.route('**/transaction-groups', async (route) => {
      if (inMaintenance && route.request().method() === 'POST') {
        await route.fulfill({
          status: 503,
          contentType: 'application/problem+json',
          headers: { 'Retry-After': '300' },
          body: JSON.stringify({
            status: 503,
            code: 'MAINTENANCE',
            title: 'Service Unavailable',
            detail: 'Sistema em manutenção.',
          }),
        });
      } else {
        await route.continue();
      }
    });

    const user = await newUser(request);
    await apiPost(request, user, '/accounts', { name: 'Carteira', type: 'CASH' });
    await signIn(page, user.email);

    // Banner de manutenção visível no app
    const maintBanner = page.getByTestId('maintenance-banner');
    await expect(maintBanner).toBeVisible();

    // Tenta lançar uma despesa pela tela de novo lançamento (rota /novo): o envio recebe 503 MAINTENANCE
    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await expect(page.getByLabel('Valor', { exact: true })).toBeFocused(); // a tela carrega sob demanda: espera abrir
    await page.keyboard.type('3500');
    await page.getByLabel('Descrição (opcional)').fill('Almoço');
    await chooseAccount(page, page, 'Carteira');
    await chooseOption(page, page, 'Categoria', 'Alimentação');
    await page.getByRole('button', { name: 'Salvar' }).click();

    // A fila do aparelho só guarda lançamentos quando falta rede (status 0); a manutenção (503) é recusada com
    // aviso, e a tela mantém tudo o que foi digitado para repetir o envio.
    await expect(page.getByRole('alert').filter({ hasText: 'Sistema em manutenção.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Novo lançamento' })).toBeVisible();
    await expect(page.getByLabel('Valor', { exact: true })).toHaveValue(/35,00/);
    await expect(page.getByLabel('Descrição (opcional)')).toHaveValue('Almoço');

    // Manutenção é encerrada no servidor: repetir o envio, sem redigitar, registra o lançamento
    inMaintenance = false;
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();

    await openTab(page, 'Lançamentos');
    const card = page.getByTestId('transaction-card').filter({ hasText: 'Almoço' });
    await expect(card).toBeVisible();
    await expect(card).not.toContainText('Pendente de envio');
  });
});
