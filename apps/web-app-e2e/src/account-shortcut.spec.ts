import { expect, test } from '@playwright/test';
import { register, uniqueEmail } from './support';

test.describe('atalho Minha conta na barra superior (web)', () => {
  test('mostra o nome e a inicial à direita, abre Minha conta e atualiza ao salvar o nome', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);

    const chip = page.getByTestId('account-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(email.split('@')[0]);

    const box = await chip.boundingBox();
    const viewport = page.viewportSize();
    expect(box!.x + box!.width).toBeGreaterThan(viewport!.width - 48);

    await chip.click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(chip).toHaveAttribute('aria-current', 'page');

    await page.getByLabel('Nome', { exact: true }).fill('Ana Souza');
    await page.getByRole('button', { name: 'Salvar nome' }).click();
    await expect(chip).toContainText('Ana Souza');
    await expect(chip).toHaveAttribute('aria-label', 'Minha conta — Ana Souza');
    await expect(chip.locator('span[aria-hidden="true"]').first()).toHaveText('A');
  });

  test('em tela estreita a barra mantém logo e atalho sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await register(page, uniqueEmail());
    await expect(page.getByTestId('account-chip')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
