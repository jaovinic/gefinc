import { expect, test } from '@playwright/test';
import { API, newUser, signIn } from './support';

test.describe('atalho Minha conta no cabeçalho (app): abre o menu Mais', () => {
  test('mostra nome e inicial fixos à direita e abre o menu Mais com Minha conta', async ({ page, request }) => {
    const user = await newUser(request);
    const patch = await request.patch(`${API}/auth/me`, { headers: user.headers, data: { name: 'Ana Souza' } });
    expect(patch.ok()).toBeTruthy();
    await signIn(page, user.email);

    const chip = page.getByTestId('account-chip');
    await expect(chip).toContainText('Ana Souza');
    await expect(chip).toHaveAttribute('aria-label', 'Mais opções — Ana Souza');
    await expect(chip).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    const box = await chip.boundingBox();
    expect(box!.x + box!.width).toBeGreaterThan(page.viewportSize()!.width - 24);

    await chip.click();
    const more = page.getByRole('dialog', { name: 'Mais', exact: true });
    await expect(more).toBeVisible();
    await expect(chip).toHaveAttribute('aria-expanded', 'true');
    await expect(page).not.toHaveURL(/\/minha-conta$/);

    await more.getByRole('link', { name: 'Minha conta' }).click();
    await expect(page).toHaveURL(/\/minha-conta$/);
    await expect(more).toHaveCount(0);
  });

  test('o foco fica preso no menu, Escape fecha e o foco volta ao atalho', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    const chip = page.getByTestId('account-chip');
    await chip.focus();
    await page.keyboard.press('Enter');
    const more = page.getByRole('dialog', { name: 'Mais', exact: true });
    await expect(more).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await more.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(more).toHaveCount(0);
    await expect(chip).toBeFocused();
  });

  test('segue visível depois de rolar a página e em 320px, sem rolagem horizontal', async ({ page, request }) => {
    const user = await newUser(request);
    await page.setViewportSize({ width: 320, height: 640 });
    await signIn(page, user.email);
    await page.getByRole('main').evaluate((el) => el.scrollTo(0, 500));
    await expect(page.getByTestId('account-chip')).toBeInViewport();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
