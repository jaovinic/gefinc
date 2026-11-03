import { Page, expect, test } from '@playwright/test';
import { goToBackground, installNativeDoubles, queueBiometric, returnToForeground, setBiometricAvailable } from './native-doubles';
import { newUser, openFromMore, signIn, chooseOption } from './support';

const lockScreen = (page: Page) => page.getByRole('dialog', { name: 'Aplicativo bloqueado' });
const toggle = (page: Page) => page.getByRole('switch', { name: 'Bloquear o app com biometria' });

async function enableLock(page: Page, minutes: '0' | '1' | '5' = '0') {
  await openFromMore(page, 'Minha conta');
  await chooseOption(page, page, 'Bloquear depois de', { '0': 'Na hora', '1': '1 minuto', '5': '5 minutos' }[minutes]);
  await queueBiometric(page, 'ok');
  await toggle(page).check();
  await expect(toggle(page)).toBeChecked();
  // o app ignora idas ao segundo plano até 2 s depois do diálogo da biometria (são do próprio diálogo)
  await page.waitForTimeout(2_200);
}

test.describe('bloqueio por biometria', () => {
  test('ativar o bloqueio; voltar do segundo plano bloqueia e a biometria desbloqueia', async ({ page, request }) => {
    await installNativeDoubles(page, { biometric: { defaultResult: 'cancelled' } });
    const user = await newUser(request);
    await signIn(page, user.email);

    await enableLock(page);

    await goToBackground(page);
    await returnToForeground(page);
    await expect(lockScreen(page)).toBeVisible();
    // por baixo, o app inteiro fica inerte e a tela não mostra valores
    await expect(page.locator('ion-app')).toHaveAttribute('inert', '');
    await expect(lockScreen(page)).not.toContainText('R$');

    await queueBiometric(page, 'ok');
    await page.getByRole('button', { name: 'Desbloquear com biometria' }).click();
    await expect(lockScreen(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Minha conta', exact: true })).toBeVisible();
  });

  test('biometria não reconhecida avisa e permite tentar de novo; cancelar não conta como falha', async ({ page, request }) => {
    await installNativeDoubles(page, { biometric: { defaultResult: 'cancelled' } });
    const user = await newUser(request);
    await signIn(page, user.email);
    await enableLock(page);
    await goToBackground(page);
    await queueBiometric(page, 'failed'); // a tentativa automática ao bloquear
    await returnToForeground(page);

    await expect(lockScreen(page).getByRole('alert')).toContainText('Biometria não reconhecida');
    await expect(lockScreen(page)).toBeVisible();

    await queueBiometric(page, 'cancelled');
    await page.getByRole('button', { name: 'Desbloquear com biometria' }).click();
    await expect(lockScreen(page).getByRole('alert')).toHaveCount(0);

    await queueBiometric(page, 'ok');
    await page.getByRole('button', { name: 'Desbloquear com biometria' }).click();
    await expect(lockScreen(page)).toHaveCount(0);
  });

  test('com o tempo de 1 minuto, voltar logo do segundo plano não bloqueia', async ({ page, request }) => {
    await installNativeDoubles(page, { biometric: { defaultResult: 'cancelled' } });
    const user = await newUser(request);
    await signIn(page, user.email);
    await enableLock(page, '1');

    await goToBackground(page);
    await returnToForeground(page);

    await expect(lockScreen(page)).toHaveCount(0);
  });

  test('o app abre bloqueado depois de ser fechado e reaberto', async ({ page, request }) => {
    await installNativeDoubles(page, { biometric: { defaultResult: 'cancelled' } });
    const user = await newUser(request);
    await signIn(page, user.email);
    await enableLock(page);

    await page.reload();

    await expect(lockScreen(page)).toBeVisible();
  });

  test('biometria bloqueada ou indisponível: só e-mail e senha; entrar com a senha encerra a sessão', async ({ page, request }) => {
    await installNativeDoubles(page, { biometric: { defaultResult: 'cancelled' } });
    const user = await newUser(request);
    await signIn(page, user.email);
    await enableLock(page);
    await goToBackground(page);
    await queueBiometric(page, 'lockout');
    await returnToForeground(page);

    await expect(lockScreen(page).getByRole('alert')).toContainText('senha');
    await expect(page.getByRole('button', { name: 'Desbloquear com biometria' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Entrar com e-mail e senha' }).click();
    await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible();
    await expect(lockScreen(page)).toHaveCount(0);
  });

  test('biometria removida do aparelho: o bloqueio é desligado, o motivo é mostrado e a senha é exigida', async ({ page, request }) => {
    await installNativeDoubles(page, { biometric: { defaultResult: 'cancelled' } });
    const user = await newUser(request);
    await signIn(page, user.email);
    await enableLock(page);
    await goToBackground(page);
    await setBiometricAvailable(page, false);
    await returnToForeground(page);

    await expect(lockScreen(page).getByRole('alert')).toContainText('biometria');
    await expect(page.getByRole('button', { name: 'Desbloquear com biometria' })).toHaveCount(0);
  });

  test('sem biometria cadastrada, a tela explica como habilitar e o bloqueio não liga', async ({ page, request }) => {
    await installNativeDoubles(page, { biometric: { available: false, reason: 'Nenhuma digital cadastrada neste aparelho.', defaultResult: 'cancelled' } });
    const user = await newUser(request);
    await signIn(page, user.email);

    await openFromMore(page, 'Minha conta');
    await toggle(page).click();

    await expect(page.getByTestId('lock-feedback')).toContainText('Nenhuma digital cadastrada');
    await expect(toggle(page)).not.toBeChecked();
  });

  test('desligar o bloqueio exige confirmar com a biometria', async ({ page, request }) => {
    await installNativeDoubles(page, { biometric: { defaultResult: 'cancelled' } });
    const user = await newUser(request);
    await signIn(page, user.email);
    await enableLock(page);

    await queueBiometric(page, 'failed');
    await toggle(page).click();
    await expect(toggle(page)).toBeChecked();

    await queueBiometric(page, 'ok');
    await toggle(page).click();
    await expect(toggle(page)).not.toBeChecked();
  });
});
