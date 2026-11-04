import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { createAccount, register, uniqueEmail, chooseOption } from './support';

const rgb = (r: number, g: number, b: number) => `rgb(${r}, ${g}, ${b})`;
const THEME_KEY = 'gefinc.ui.theme';
const GLASS_KEY = 'gefinc.ui.glass';
const glass = (page: Page) => page.evaluate(() => document.documentElement.dataset['glass']);
const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset['theme']);

async function violations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('tema claro e escuro (web)', () => {
  test('o alternador da barra do topo percorre Claro, Escuro e Sistema e a escolha persiste', async ({ page }) => {
    await register(page, uniqueEmail());
    const toggle = page.getByRole('banner').getByTestId('theme-toggle');
    expect(await theme(page)).toBe('dark');
    await expect(toggle).toHaveAttribute('aria-label', 'Tema: sistema. Alternar para claro');

    await toggle.click();
    await expect.poll(() => theme(page)).toBe('light');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(rgb(243, 246, 251));
    await toggle.click();
    await expect.poll(() => theme(page)).toBe('dark');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Tema: sistema. Alternar para claro');

    await toggle.click();
    await page.reload();
    expect(await theme(page)).toBe('light');
    expect(await page.evaluate((key) => localStorage.getItem(key), THEME_KEY)).toBe('light');
  });

  test('Minha conta tem a seção Aparência com as três opções', async ({ page }) => {
    await register(page, uniqueEmail());
    await page.goto('/settings');
    const group = page.getByRole('radiogroup', { name: 'Aparência' });
    await expect(group.getByRole('radio')).toHaveCount(3);
    await group.getByRole('radio', { name: 'Claro' }).check();
    await expect.poll(() => theme(page)).toBe('light');
  });

  test('a barra do topo e o menu lateral são de vidro, e viram opacos com contraste alto', async ({ page }) => {
    await register(page, uniqueEmail());
    const bg = (testid: string) => page.getByTestId(testid).evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, blur: getComputedStyle(el).backdropFilter }));
    const side = await bg('sidenav');
    expect(side.bg).toMatch(/^rgba\(19, 27, 46, 0\.\d+\)$/);
    expect(side.blur).toContain('blur');

    await page.emulateMedia({ contrast: 'more' });
    const opaque = await bg('sidenav');
    expect(opaque.bg).toBe(rgb(19, 27, 46));
    expect(opaque.blur).toBe('none');
  });

  test('Minha conta desliga o desfoque (vidro): a barra do topo e o menu lateral ficam sem filtro, e a escolha persiste', async ({ page }) => {
    await register(page, uniqueEmail());
    expect(await glass(page)).toBe('blur');
    await page.goto('/settings');
    const toggle = page.getByRole('region', { name: 'Aparência' }).getByRole('switch', { name: 'Desfoque (vidro)' });
    await expect(toggle).toBeChecked();
    const blur = (testid: string) => page.getByTestId(testid).evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(await blur('sidenav')).toContain('blur(12px)');

    await toggle.uncheck();
    await expect.poll(() => glass(page)).toBe('flat');
    expect(await page.evaluate((key) => localStorage.getItem(key), GLASS_KEY)).toBe('flat');
    expect(await blur('sidenav')).toBe('none');

    await page.reload();
    expect(await glass(page)).toBe('flat');
    await expect(page.getByRole('switch', { name: 'Desfoque (vidro)' })).not.toBeChecked();
    expect(await blur('sidenav')).toBe('none');

    await page.getByRole('switch', { name: 'Desfoque (vidro)' }).check();
    await expect.poll(() => glass(page)).toBe('blur');
    expect(await blur('sidenav')).toContain('blur');
  });

  test('um valor inválido gravado para o desfoque é ignorado e o sem flash respeita "sólido"', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, '"><script>'), GLASS_KEY);
    await page.goto('/login');
    expect(await glass(page)).toBe('blur');

    const other = await page.context().newPage();
    await other.addInitScript((key) => {
      localStorage.setItem(key, 'flat');
      const seen: string[] = [];
      (window as unknown as { __glass: string[] }).__glass = seen;
      new MutationObserver((records) => {
        for (const record of records) seen.push((record.target as HTMLElement).getAttribute('data-glass') ?? '');
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-glass'] });
    }, GLASS_KEY);
    await other.goto('/login');
    const seen = await other.evaluate(() => (window as unknown as { __glass: string[] }).__glass);
    expect(seen).not.toContain('blur');
    expect(seen[0]).toBe('flat');
  });

  test('Minha conta passa no axe com o desfoque desligado nos dois temas', async ({ page }) => {
    await register(page, uniqueEmail());
    await page.goto('/settings');
    await page.getByRole('switch', { name: 'Desfoque (vidro)' }).uncheck();
    const problems: string[] = [];
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expect.poll(() => theme(page)).toBe(scheme);
      for (const v of await violations(page)) problems.push(`${scheme}: ${v}`);
    }
    expect(problems).toEqual([]);
  });

  test('no tema claro o foco dos campos é neutro e os cartões têm borda legível', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú', 'CHECKING');
    await page.goto('/transactions');
    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    const form = page.locator('gef-group-form');
    await form.getByLabel('Descrição ou loja').focus();
    const [outline, style] = await form.getByLabel('Descrição ou loja').evaluate((el) => [getComputedStyle(el).outlineColor, getComputedStyle(el).outlineStyle]);
    expect(style).toBe('solid');
    expect(outline).toBe(rgb(71, 85, 105));
  });

  test('telas de acesso e autenticadas passam no axe (WCAG AA) no tema claro', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    const problems: string[] = [];
    for (const path of ['/login', '/register', '/forgot-password']) {
      await page.goto(path);
      await expect(page.getByRole('button').first()).toBeVisible();
      expect(await theme(page)).toBe('light');
      for (const v of await violations(page)) problems.push(`${path}: ${v}`);
    }
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
      ['/settings', 'Minha conta'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
      await expect(page.getByText(/Carregando/)).toHaveCount(0);
      for (const v of await violations(page)) problems.push(`${path}: ${v}`);
    }
    expect(problems).toEqual([]);
  });

  test('o seletor Valor total / Valor da parcela do cadastro completo está separado do campo de valor', async ({ page }) => {
    await register(page, uniqueEmail());
    await createAccount(page, 'Itaú', 'CHECKING');
    await page.goto('/transactions');
    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    const form = page.locator('gef-group-form');
    await chooseOption(page, form, 'Tipo', 'Parcelado');
    const mode = form.locator('gef-amount-mode-switch');
    await expect(mode).toContainText('O valor digitado é');
    await expect(mode.getByRole('button')).toHaveText(['Valor total', 'Valor da parcela']);
    await mode.getByRole('button', { name: 'Valor da parcela' }).click();
    await expect(mode.getByRole('button', { name: 'Valor da parcela' })).toHaveAttribute('aria-pressed', 'true');
    expect(await form.locator('gef-money-input gef-amount-mode-switch').count()).toBe(0);
  });
});
