import { expect, test } from '@playwright/test';
import { apiGet, newUser, openTab, signIn } from './support';

test.describe('contas bancárias PF e PJ no celular', () => {
  test('cadastra conta PF e PJ com ícone, filtra por titular e altera o titular', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    await openTab(page, 'Contas');

    for (const [name, holder, icon] of [['Itaú pessoal', 'Pessoa física', 'Casa'], ['Inter empresa', 'Pessoa jurídica', 'Maleta']]) {
      await page.getByRole('button', { name: 'Nova conta' }).first().click();
      await page.getByLabel('Nome').fill(name);
      await page.locator('gef-account-form').getByLabel(holder).check();
      await page.getByRole('radio', { name: icon }).click();
      await page.getByRole('button', { name: 'Salvar' }).click();
      await expect(page.getByTestId('account-card').filter({ hasText: name })).toBeVisible();
    }

    await expect(page.getByTestId('account-card').filter({ hasText: 'Inter empresa' }).locator('[data-holder]')).toHaveText('PJ');
    await expect(page.getByTestId('account-card').filter({ hasText: 'Itaú pessoal' }).locator('[data-holder]')).toHaveText('PF');

    // filtro por titular
    await page.getByRole('radiogroup', { name: 'Filtrar por titular' }).getByLabel('Pessoa jurídica').check();
    await expect(page.getByTestId('account-card')).toHaveCount(1);
    await expect(page.getByTestId('account-card')).toContainText('Inter empresa');
    await page.getByRole('radiogroup', { name: 'Filtrar por titular' }).getByLabel('Todas').check();
    await expect(page.getByTestId('account-card')).toHaveCount(2);

    // altera o titular de PF para PJ
    await page.getByRole('button', { name: 'Editar Itaú pessoal' }).click();
    await page.locator('gef-account-form').getByLabel('Pessoa jurídica').check();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByTestId('account-card').filter({ hasText: 'Itaú pessoal' }).locator('[data-holder]')).toHaveText('PJ');

    const accounts = (await apiGet(request, user, '/accounts')) as { name: string; holderType: string; icon: string }[];
    expect(accounts.find((a) => a.name === 'Inter empresa')).toMatchObject({ holderType: 'PJ', icon: 'briefcase' });
    expect(accounts.find((a) => a.name === 'Itaú pessoal')).toMatchObject({ holderType: 'PJ', icon: 'landmark' });
  });
});
