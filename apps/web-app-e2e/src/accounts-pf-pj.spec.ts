import { expect, test } from '@playwright/test';
import { createAccount, register, uniqueEmail } from './support';

test.describe('contas bancárias PF e PJ', () => {
  test('cadastra conta PF e PJ com ícones, filtra, altera o titular e inativa', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú pessoal', 'CHECKING', undefined, { holder: 'PF' });
    await createAccount(page, 'Inter empresa', 'CHECKING', undefined, { holder: 'PJ' });

    // ícone escolhido na conta PJ
    await page.getByRole('row', { name: /Inter empresa/ }).getByRole('button', { name: 'Editar' }).click();
    await page.getByRole('radio', { name: 'Maleta' }).click();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('row', { name: /Inter empresa/ })).toContainText('PJ');

    // filtro por titular
    await page.getByRole('radiogroup', { name: 'Filtrar por titular' }).getByLabel('Pessoa jurídica').check();
    await expect(page.getByRole('row', { name: /Inter empresa/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Itaú pessoal/ })).toHaveCount(0);
    await page.getByRole('radiogroup', { name: 'Filtrar por titular' }).getByLabel('Pessoa física').check();
    await expect(page.getByRole('row', { name: /Itaú pessoal/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Inter empresa/ })).toHaveCount(0);
    await page.getByRole('radiogroup', { name: 'Filtrar por titular' }).getByLabel('Todas').check();

    // altera o titular da conta PF para PJ: passa a aparecer como PJ
    await page.getByRole('row', { name: /Itaú pessoal/ }).getByRole('button', { name: 'Editar' }).click();
    await page.locator('gef-account-form').getByLabel('Pessoa jurídica').check();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('row', { name: /Itaú pessoal/ })).toContainText('PJ');
    // com só PJ, o filtro some
    await expect(page.getByRole('radiogroup', { name: 'Filtrar por titular' })).toHaveCount(0);

    // inativa
    await page.getByRole('row', { name: /Inter empresa/ }).getByRole('button', { name: 'Inativar' }).click();
    await expect(page.getByRole('row', { name: /Inter empresa/ })).toHaveCount(0);
  });
});
