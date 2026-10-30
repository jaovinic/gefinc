import { expect, test } from '@playwright/test';
import { API, newUser, signIn } from './support';

test.describe('atalho Minha conta no cabeçalho (app)', () => {
  test('mostra nome e inicial fixos à direita e abre Minha conta', async ({ page, request }) => {
    const user = await newUser(request);
    const patch = await request.patch(`${API}/auth/me`, { headers: user.headers, data: { name: 'Ana Souza' } });
    expect(patch.ok()).toBeTruthy();
    await signIn(page, user.email);

    const chip = page.getByTestId('account-chip');
    await expect(chip).toContainText('Ana Souza');
    await expect(chip).toHaveAttribute('aria-label', 'Minha conta — Ana Souza');
    const box = await chip.boundingBox();
    expect(box!.x + box!.width).toBeGreaterThan(page.viewportSize()!.width - 24);

    await chip.click();
    await expect(page).toHaveURL(/\/minha-conta$/);
    await expect(chip).toHaveAttribute('aria-current', 'page');
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
