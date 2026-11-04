import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { chooseOption, createAccount, register, selectTrigger, todayIso, uniqueEmail } from './support';

const NATIVE_CONTROLS = 'select, input[type="date"], input[type="color"], input[type="month"], input[type="time"], input[type="datetime-local"], input[type="week"]';

const nativeControls = (page: Page) => page.evaluate((selector) => document.querySelectorAll(selector).length, NATIVE_CONTROLS);

async function violations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('controles próprios no web: lista, calendário e paleta', () => {
  test('lista de escolha: filtros, teclado, foco devolvido e sem controle nativo', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú', 'CHECKING');
    await page.goto('/transactions');
    await expect(page.getByRole('heading', { name: 'Lançamentos', exact: true })).toBeVisible();
    expect(await nativeControls(page)).toBe(0);

    const status = selectTrigger(page, page, 'Status');
    await expect(status).toContainText('Todos os status');
    await status.click();
    const dialog = page.getByRole('dialog', { name: 'Status' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('option', { name: 'Todos os status' })).toBeFocused();
    expect(await violations(page)).toEqual([]);

    // teclado: seta, Enter e foco de volta ao campo
    await page.keyboard.press('ArrowDown');
    await expect(dialog.getByRole('option', { name: 'Pendentes' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(status).toContainText('Pendentes');
    await expect(status).toBeFocused();

    // Escape fecha sem mudar; o gatilho abre com a seta para baixo
    await page.keyboard.press('ArrowDown');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(status).toContainText('Pendentes');

    // toque (clique) no fundo também fecha
    await status.click();
    await expect(dialog).toBeVisible();
    await page.locator('.gef-sheet-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(dialog).toHaveCount(0);

    await chooseOption(page, page, 'Natureza', 'Receitas');
    // o valor escolhido (pendente) continua, e o texto passa a ser o da receita
    await expect(selectTrigger(page, page, 'Status')).toContainText('A receber');
    await chooseOption(page, page, 'Status', 'Recebidas');
    await expect(selectTrigger(page, page, 'Status')).toContainText('Recebidas');
  });

  test('campo de data: máscara, validação, calendário por teclado e mouse', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú', 'CHECKING');
    await page.goto('/transactions');
    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    const form = page.locator('gef-group-form');
    await expect(form).toBeVisible();
    expect(await nativeControls(page)).toBe(0);

    const purchase = form.getByLabel('Data da compra');
    const [year, month, day] = todayIso().split('-');
    await expect(purchase).toHaveValue(`${day}/${month}/${year}`);
    await purchase.fill('');
    await purchase.pressSequentially('29022027');
    await expect(purchase).toHaveValue('29/02/2027');
    await expect(form.getByText('Informe uma data válida no formato dd/mm/aaaa.')).toBeVisible();
    await purchase.fill('');
    await purchase.pressSequentially('29022028');
    await expect(purchase).toHaveValue('29/02/2028');
    await expect(purchase).not.toHaveAttribute('aria-invalid', 'true');

    await form.getByRole('button', { name: 'Abrir calendário' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Escolha a data' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('grid')).toHaveAttribute('aria-label', 'fevereiro de 2028');
    await expect(dialog.getByRole('button', { name: '29 de fevereiro de 2028', exact: true })).toBeFocused();
    expect(await violations(page)).toEqual([]);
    await page.keyboard.press('ArrowRight'); // 1º de março
    await expect(dialog.getByRole('grid')).toHaveAttribute('aria-label', 'março de 2028');
    await dialog.getByRole('button', { name: 'Próximo mês' }).click();
    await dialog.getByRole('button', { name: '15 de abril de 2028', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(purchase).toHaveValue('15/04/2028');
    await expect(form.getByRole('button', { name: 'Abrir calendário' }).first()).toBeFocused();

    // o botão Hoje do calendário
    await form.getByRole('button', { name: 'Abrir calendário' }).first().click();
    await dialog.getByRole('button', { name: 'Hoje', exact: true }).click();
    await expect(purchase).toHaveValue(`${day}/${month}/${year}`);
  });

  test('paleta de cores: escolhe, grava na categoria e mostra a cor atual', async ({ page }) => {
    await register(page, uniqueEmail());
    await page.getByRole('link', { name: 'Categorias' }).click();
    await page.getByRole('button', { name: 'Nova categoria' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nova categoria' });
    await expect(dialog).toBeVisible();
    expect(await nativeControls(page)).toBe(0);
    await dialog.getByLabel('Nome').fill('Pets');
    await chooseOption(page, dialog, 'Tipo', 'Receitas');
    const palette = dialog.getByRole('radiogroup', { name: 'Cor' });
    await expect(palette.getByRole('radio')).toHaveCount(16);
    await palette.getByRole('radio', { name: 'Roxo (#A855F7)' }).click();
    await expect(palette.getByRole('radio', { name: 'Roxo (#A855F7)' })).toBeChecked();
    expect(await violations(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(dialog).toHaveCount(0);
    const row = page.getByRole('listitem').filter({ hasText: 'Pets' });
    await expect(row).toBeVisible();
    await expect(row.locator('span.rounded-full').first()).toHaveCSS('background-color', 'rgb(168, 85, 247)');

    // ao editar, a cor gravada vem marcada (aqui é uma cor da paleta, então não surge "Cor atual")
    await row.getByRole('button', { name: 'Editar' }).click();
    const edit = page.getByRole('dialog', { name: 'Editar categoria' });
    await expect(edit.getByRole('radio', { name: 'Roxo (#A855F7)' })).toBeChecked();
    await expect(edit.getByRole('radio', { name: /^Cor atual/ })).toHaveCount(0);
  });
});
