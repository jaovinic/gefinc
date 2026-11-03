import { Page, expect, test } from '@playwright/test';
import { goToBackground, installNativeDoubles, minimizedCount, pressAndroidBack, queueBiometric, returnToForeground } from './native-doubles';
import { newUser, openFromMore, openMore, openTab, signIn } from './support';

const path = (page: Page) => new URL(page.url()).pathname;
const more = (page: Page) => page.getByRole('dialog', { name: 'Mais', exact: true });

test.describe('botão Voltar do Android (com dublê do plugin)', () => {
  test.beforeEach(async ({ page }) => {
    await installNativeDoubles(page);
  });

  test('fecha o menu Mais sem sair da tela, e só depois volta na navegação', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    await openTab(page, 'Faturas');
    await expect(page).toHaveURL(/\/faturas$/);

    await openMore(page);
    await pressAndroidBack(page);
    await expect(more(page)).toHaveCount(0);
    expect(path(page)).toBe('/faturas');
    expect(await minimizedCount(page)).toBe(0);

    await pressAndroidBack(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
  });

  test('na raiz minimiza o app (não sai) e mantém a sessão', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);

    await pressAndroidBack(page);
    expect(await minimizedCount(page)).toBe(1);
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
  });

  test('sem histórico (aberto por lembrete) o Voltar leva ao painel', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    await page.goto('/faturas');
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();

    await pressAndroidBack(page, false);
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
    expect(path(page)).toBe('/');
    expect(await minimizedCount(page)).toBe(0);
  });

  test('o novo lançamento volta para a tela de onde veio', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    await page.getByRole('link', { name: 'Novo lançamento' }).click();
    await expect(page).toHaveURL(/\/novo/);

    await pressAndroidBack(page);
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
  });

  test('com o app bloqueado o Voltar é ignorado: nada fecha, nada navega, nada minimiza', async ({ page, request }) => {
    await installNativeDoubles(page, { biometric: { defaultResult: 'cancelled' } });
    const user = await newUser(request);
    await signIn(page, user.email);
    await openFromMore(page, 'Minha conta');
    await page.getByLabel('Bloquear depois de').selectOption('0');
    await queueBiometric(page, 'ok');
    await page.getByRole('switch', { name: 'Bloquear o app com biometria' }).check();
    await expect(page.getByRole('switch', { name: 'Bloquear o app com biometria' })).toBeChecked();
    await page.waitForTimeout(2_200);
    await goToBackground(page);
    await returnToForeground(page);
    const lock = page.getByRole('dialog', { name: 'Aplicativo bloqueado' });
    await expect(lock).toBeVisible();

    await pressAndroidBack(page);
    await pressAndroidBack(page, false);
    await expect(lock).toBeVisible();
    expect(path(page)).toBe('/minha-conta');
    expect(await minimizedCount(page)).toBe(0);
  });
});
