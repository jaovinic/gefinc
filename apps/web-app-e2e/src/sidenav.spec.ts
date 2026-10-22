import { expect, test } from '@playwright/test';
import { register, uniqueEmail } from './support';

const AREAS: [string, RegExp][] = [
  ['Lançamentos', /\/transactions$/],
  ['Faturas', /\/invoices$/],
  ['Fluxo de caixa', /\/cashflow$/],
  ['Contas e cartões', /\/accounts$/],
  ['Categorias', /\/categories$/],
  ['Minha conta', /\/settings$/],
  ['Painel', /\/$/],
];

test.describe('menu lateral do web', () => {
  test('fica à esquerda com logo, ícones e a área atual destacada', async ({ page }) => {
    await register(page, uniqueEmail());
    const side = page.getByTestId('sidenav');
    await expect(side).toBeVisible();
    const box = await side.boundingBox();
    expect(box!.x).toBeLessThan(2);
    expect(box!.width).toBeGreaterThan(200);
    await expect(side.getByLabel('GEFINC, ir para o painel')).toBeVisible();

    for (const [name] of AREAS) {
      const link = side.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link.locator('svg')).toBeVisible();
    }
    await expect(side.getByRole('link', { name: 'Painel', exact: true })).toHaveAttribute('aria-current', 'page');

    await side.getByRole('link', { name: 'Lançamentos', exact: true }).click();
    await expect(page).toHaveURL(/\/transactions$/);
    await expect(side.getByRole('link', { name: 'Lançamentos', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(side.getByRole('link', { name: 'Painel', exact: true })).not.toHaveAttribute('aria-current', 'page');
  });

  test('todas as áreas são alcançadas só pelo teclado', async ({ page }) => {
    await register(page, uniqueEmail());
    for (const [name, url] of AREAS) {
      await page.getByTestId('sidenav').getByRole('link', { name, exact: true }).focus();
      await expect(page.getByTestId('sidenav').getByRole('link', { name, exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(url);
    }
  });

  test('recolhe para só ícones, mostra o nome ao focar e lembra a escolha ao recarregar', async ({ page }) => {
    await register(page, uniqueEmail());
    const side = page.getByTestId('sidenav');
    await side.getByRole('button', { name: 'Recolher menu' }).click();
    await expect(side).toHaveAttribute('data-collapsed', 'true');
    expect((await side.boundingBox())!.width).toBeLessThan(100);
    await expect(side.getByRole('link', { name: 'Faturas', exact: true })).toBeVisible();
    await side.getByRole('link', { name: 'Faturas', exact: true }).hover();
    await expect(side.getByRole('link', { name: 'Faturas', exact: true })).toHaveAttribute('data-label', 'Faturas');

    await page.reload();
    await expect(page.getByTestId('sidenav')).toHaveAttribute('data-collapsed', 'true');
    await page.getByTestId('sidenav').getByRole('button', { name: 'Expandir menu' }).click();
    await expect(page.getByTestId('sidenav')).not.toHaveAttribute('data-collapsed', 'true');
  });

  test('em tela estreita vira gaveta aberta por botão e fecha ao escolher uma área', async ({ page }) => {
    await register(page, uniqueEmail());
    await page.setViewportSize({ width: 800, height: 900 });
    await expect(page.getByTestId('sidenav')).toBeHidden();
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('link', { name: 'Faturas', exact: true }).click();
    await expect(page).toHaveURL(/\/invoices$/);
    await expect(drawer).toBeHidden();

    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('Minha conta e Sair ficam no rodapé; Sair volta para o login', async ({ page }) => {
    await register(page, uniqueEmail());
    const footer = page.getByTestId('sidenav-footer');
    await expect(footer.getByRole('link', { name: 'Minha conta', exact: true })).toBeVisible();
    await footer.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
