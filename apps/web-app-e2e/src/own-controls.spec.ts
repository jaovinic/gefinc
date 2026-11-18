import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { chooseOption, createAccount, fillDate, promoteToRoot, register, selectTrigger, todayIso, uniqueEmail } from './support';

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

  test('nenhuma tela do app, nem os painéis, usa controle nativo (datas e listas são próprias)', async ({ page }) => {
    test.setTimeout(90_000); // percorre todas as telas e painéis
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú', 'CHECKING');
    await createAccount(page, 'Carteira', 'CASH');
    const found: string[] = [];
    const check = async (where: string) => {
      if ((await nativeControls(page)) > 0) found.push(where);
    };

    for (const path of ['/', '/transactions', '/accounts', '/transfers', '/invoices', '/cashflow', '/categories', '/settings']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await check(path);
    }
    await page.goto('/transactions');
    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    await expect(page.locator('gef-group-form')).toBeVisible();
    await check('/transactions > Novo lançamento');
    await page.keyboard.press('Escape');
    await page.goto('/transfers');
    await page.getByRole('button', { name: 'Nova transferência' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Nova transferência' })).toBeVisible();
    await check('/transfers > Nova transferência');
    await expect(page.getByRole('dialog', { name: 'Nova transferência' }).locator('gef-date-field')).toHaveCount(1);

    expect(found).toEqual([]);
  });

  test('painel de administração: a auditoria usa campos de data próprios e nenhuma tela admin tem controle nativo', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    promoteToRoot(email);
    const found: string[] = [];

    await page.goto('/admin/audit');
    await expect(page.getByRole('heading', { name: 'Auditoria', exact: true })).toBeVisible();
    await expect(page.locator('gef-date-field')).toHaveCount(2);
    const from = page.getByLabel('De (data inicial)', { exact: true });
    const to = page.getByLabel('Até (data final)', { exact: true });
    await expect(from).toHaveAttribute('type', 'text');
    await expect(from).toHaveAttribute('placeholder', 'dd/mm/aaaa');
    await fillDate(from, todayIso());
    await expect(from).not.toHaveAttribute('aria-invalid', 'true');
    await expect(to).toHaveValue('');
    expect(await nativeControls(page)).toBe(0);

    await page.getByRole('button', { name: 'Abrir calendário' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Escolha a data' });
    await expect(dialog).toBeVisible();
    expect(await nativeControls(page)).toBe(0);
    expect(await violations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    for (const path of ['/admin/audit', '/admin/users', '/admin/invitations', '/admin/communications/pending', '/admin/deletion-reasons', '/admin/email', '/admin/settings']) {
      await page.goto(path);
      await expect(page.locator('[data-testid="admin-panel"]')).toBeVisible();
      if ((await nativeControls(page)) > 0) found.push(path);
    }
    expect(found).toEqual([]);
  });

  test('painel longo em tela baixa: cabeçalho e rodapé (Salvar/Cancelar) ficam colados nas bordas ao rolar', async ({ page }) => {
    await register(page, uniqueEmail());
    await page.setViewportSize({ width: 360, height: 480 });
    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Nova conta' }).first().click();
    const sheet = page.locator('.gef-sheet');
    await expect(sheet).toBeVisible();
    await chooseOption(page, page, 'Tipo', 'Cartão de crédito');
    expect(await sheet.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

    for (const position of ['top', 'middle', 'bottom'] as const) {
      const gaps = await sheet.evaluate((el, where) => {
        el.scrollTop = where === 'top' ? 0 : where === 'middle' ? (el.scrollHeight - el.clientHeight) / 2 : el.scrollHeight;
        const box = el.getBoundingClientRect();
        const head = el.querySelector('.gef-sheet-head')?.getBoundingClientRect();
        const actions = el.querySelector('.gef-sheet-actions')?.getBoundingClientRect();
        return { head: head ? head.top - box.top : 999, actions: actions ? box.bottom - actions.bottom : 999 };
      }, position);
      // 1 px de borda do painel; o texto que rola não pode aparecer nos 16 px de respiro acima e abaixo
      expect(gaps.head, `cabeçalho (${position})`).toBeLessThanOrEqual(1.5);
      expect(gaps.actions, `rodapé (${position})`).toBeLessThanOrEqual(1.5);
    }
    await expect(sheet.getByRole('button', { name: 'Salvar' })).toBeInViewport();
    await expect(sheet.getByRole('button', { name: 'Fechar' })).toBeInViewport();
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
