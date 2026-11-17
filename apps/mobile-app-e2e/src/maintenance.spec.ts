import { expect, test } from '@playwright/test';
import { chooseAccount, chooseOption, fillDate, newUser, openTab, signIn, todayIso } from './support';

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

  test('lançamentos realizados durante manutenção são preservados na fila offline e sincronizados após o término', async ({
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
    await signIn(page, user.email);

    // Banner de manutenção visível no app
    const maintBanner = page.getByTestId('maintenance-banner');
    await expect(maintBanner).toBeVisible();

    // Navega para novo lançamento
    await openTab(page, 'Lançamentos');
    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    const form = page.locator('gef-group-form');
    await form.getByLabel('Descrição ou loja').fill('Almoço');
    await chooseAccount(page, form, 'Carteira');
    await chooseOption(page, form, 'Categoria', 'Alimentação');
    await form.getByLabel('Valor').fill('3500');
    await fillDate(form.getByLabel(/vencimento/i), todayIso());
    await form.getByRole('button', { name: 'Salvar' }).click();

    // Lançamento aparece na listagem local marcado como pendente de envio
    const card = page.getByTestId('transaction-card').filter({ hasText: 'Almoço' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Pendente de envio');

    // Manutenção é encerrada no servidor
    inMaintenance = false;

    // Dispara nova tentativa ao mudar de aba e aguarda envio da fila
    await openTab(page, 'Painel');
    await openTab(page, 'Lançamentos');

    // Ao restabelecer a conexão com a API, o lançamento deixa de ficar pendente
    await expect(card).not.toContainText('Pendente de envio', { timeout: 15_000 });
  });
});
