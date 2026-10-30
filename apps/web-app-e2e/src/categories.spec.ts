import { expect, test } from '@playwright/test';
import { register, uniqueEmail } from './support';

test('categorias iniciais, criação, edição e exclusão', async ({ page }) => {
  await register(page, uniqueEmail());
  await page.getByRole('link', { name: 'Categorias' }).click();

  await expect(page.getByText('Alimentação')).toBeVisible();
  await expect(page.getByText('Salário')).toBeVisible();

  await page.getByRole('button', { name: 'Nova categoria' }).click();
  await page.getByLabel('Nome').fill('Pets');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Pets' })).toBeVisible();

  await page.getByRole('listitem').filter({ hasText: 'Pets' }).getByRole('button', { name: 'Editar' }).click();
  await page.getByLabel('Nome').fill('Animais');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Animais' })).toBeVisible();

  await page.getByRole('listitem').filter({ hasText: 'Animais' }).getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('será excluída definitivamente');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir categoria "Animais"' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Animais' })).toHaveCount(0);
});
