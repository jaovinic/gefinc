import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { createAccount, register, todayIso, uniqueEmail } from './support';

/** Falhas de acessibilidade graves (WCAG 2 A e AA) da página aberta. */
async function violations(page: Page) {
  // painéis entram com animação de opacidade: mede o contraste no estado final
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return result.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('acessibilidade (WCAG AA)', () => {
  test('telas de acesso', async ({ page }) => {
    for (const path of ['/login', '/register', '/forgot-password']) {
      await page.goto(path);
      await expect(page.getByRole('button').first()).toBeVisible();
      expect(await violations(page), path).toEqual([]);
    }
  });

  test('telas autenticadas', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú', 'CHECKING');
    await createAccount(page, 'Nubank', 'CREDIT_CARD', { closing: 10, due: 17 });

    for (const [path, heading] of [
      ['/', 'Painel do mês'],
      ['/transactions', 'Lançamentos'],
      ['/invoices', 'Faturas'],
      ['/cashflow', 'Fluxo de caixa'],
      ['/accounts', 'Contas e cartões'],
      ['/categories', 'Categorias'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
      expect(await violations(page), path).toEqual([]);
    }
  });

  test('menu lateral (aberto, recolhido e em gaveta), formulário de conta com ícones e seletor de conta', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú', 'CHECKING');
    expect(await violations(page), 'menu aberto').toEqual([]);

    await page.getByTestId('sidenav').getByRole('button', { name: 'Recolher menu' }).click();
    expect(await violations(page), 'menu recolhido').toEqual([]);

    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Nova conta' }).first().click();
    await page.getByLabel('Tipo').selectOption('CREDIT_CARD');
    await page.getByLabel('Conta bancária').click();
    await expect(page.getByRole('dialog', { name: 'Conta bancária' })).toBeVisible();
    expect(await violations(page), 'seletor de conta').toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByLabel('Tipo').selectOption('CHECKING');
    await expect(page.getByRole('radio', { name: 'Banco' })).toBeVisible();
    expect(await violations(page), 'formulário de conta').toEqual([]);
    await page.getByRole('dialog', { name: 'Nova conta' }).getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.setViewportSize({ width: 800, height: 900 });
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
    expect(await violations(page), 'gaveta do menu').toEqual([]);
  });

  test('receita/despesa e status nunca dependem só da cor: têm sinal, seta e ícone', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú', 'CHECKING');
    await page.goto('/transactions');
    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    const form = page.locator('gef-group-form');
    await form.getByLabel('Receita').check();
    await form.getByLabel('Descrição ou loja').fill('Salário');
    await form.getByLabel('Conta ou cartão').click();
    await page.locator('[role="option"]').first().click();
    await form.getByLabel('Categoria').selectOption({ label: 'Salário' });
    await form.getByLabel('Valor').fill('500000');
    // receita tem uma só data (a do recebimento), sem "Data da compra" nem "Vencimento"
    await expect(form.getByLabel('Data do recebimento')).toBeVisible();
    await expect(form.getByLabel('Data da compra')).toHaveCount(0);
    await expect(form.getByLabel(/vencimento/i)).toHaveCount(0);
    await form.getByLabel('Data do recebimento').fill(todayIso());
    await form.getByRole('button', { name: 'Salvar' }).click();

    const amount = page.locator('td[data-kind="income"]').first();
    await expect(amount).toContainText('+ R$ 5.000,00');
    await expect(amount.locator('svg')).toBeVisible();
    // receita de hoje já entra na conta: aparece como Recebido, sem ação de receber
    const row = page.getByRole('row', { name: /Salário/ });
    await expect(row).toContainText('Recebido');
    await expect(row.getByRole('button', { name: /Receber|Antecipar/ })).toHaveCount(0);
    await expect(row.locator('span.rounded-full svg')).toBeVisible();
    await expect(page.getByTestId('toast')).toContainText('Lançamento registrado.');
    expect(await violations(page), 'lançamentos com sinal e ícones').toEqual([]);
  });

  test('o foco dos campos de digitação é neutro: nunca verde nem ciano', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú', 'CHECKING');
    await page.goto('/transactions');
    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    const form = page.locator('gef-group-form');

    const GREEN = 'rgb(0, 229, 153)';
    const CYAN = 'rgb(0, 180, 216)';
    const focusColors = (locator: ReturnType<typeof form.locator>) =>
      locator.evaluate((el) => {
        const field = (el.closest('.gef-money-field') as HTMLElement | null) ?? el;
        const own = getComputedStyle(el);
        const wrapper = getComputedStyle(field);
        // sem contorno (outline: none) a cor do contorno é só o `currentColor` do texto, que não é indicador de foco
        const outline = own.outlineStyle === 'none' ? 'none' : own.outlineColor;
        return [outline, own.outlineStyle, own.borderColor, wrapper.borderColor, wrapper.boxShadow];
      });

    // campo de texto, seletor, data e valor: o contorno e a borda no foco não usam o verde nem o ciano da marca
    for (const field of [
      form.getByLabel('Descrição ou loja'),
      form.getByLabel('Categoria'),
      form.getByLabel('Data da compra'),
      form.getByLabel('Valor'),
    ]) {
      await field.focus();
      const colors = (await focusColors(field)).join(' | ');
      expect(colors).not.toContain(GREEN);
      expect(colors).not.toContain(CYAN);
    }

    // o indicador de foco continua visível: o campo de texto tem contorno e o de valor, borda de foco
    await form.getByLabel('Descrição ou loja').focus();
    const [outlineColor, outlineStyle] = await focusColors(form.getByLabel('Descrição ou loja'));
    expect(outlineStyle).toBe('solid');
    expect(outlineColor).toBe('rgb(148, 163, 184)');
    await form.getByLabel('Valor').focus();
    const [, , , wrapperBorder] = await focusColors(form.getByLabel('Valor'));
    expect(wrapperBorder).toBe('rgb(148, 163, 184)');
  });
});
