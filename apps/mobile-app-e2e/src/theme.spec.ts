import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { apiPost, categoryId, newUser, openMore, signIn, todayIso } from './support';

const rgb = (r: number, g: number, b: number) => `rgb(${r}, ${g}, ${b})`;
const THEME_KEY = 'gefinc.ui.theme';

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset['theme']);
const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

async function seed(request: Parameters<typeof newUser>[0]) {
  const user = await newUser(request);
  const itau = await apiPost(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING', holderType: 'PF' });
  await apiPost(request, user, '/accounts', { name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, bankAccountId: itau.id });
  const food = await categoryId(request, user, 'Alimentação');
  const month = todayIso().slice(0, 7);
  await apiPost(request, user, '/transaction-groups', {
    description: 'Mercado', recurrenceType: 'VARIABLE', totalAmount: '150.00', accountId: itau.id, categoryId: food,
    purchaseDate: `${month}-01`, firstDueDate: `${month}-27`,
  });
  return user;
}

test.describe('alternância de tema (app)', () => {
  test('o menu Mais troca para Claro, persiste ao recarregar e volta ao Escuro', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    expect(await theme(page)).toBe('dark');
    expect(await bodyBg(page)).toBe(rgb(9, 13, 22));

    const more = await openMore(page);
    const group = more.getByRole('radiogroup', { name: 'Aparência' });
    await expect(group.getByRole('radio', { name: 'Sistema' })).toBeChecked();
    await group.getByRole('radio', { name: 'Claro' }).check();
    await expect.poll(() => theme(page)).toBe('light');
    expect(await bodyBg(page)).toBe(rgb(243, 246, 251));
    expect(await page.evaluate((key) => localStorage.getItem(key), THEME_KEY)).toBe('light');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
    expect(await theme(page)).toBe('light');
    const again = await openMore(page);
    await expect(again.getByRole('radio', { name: 'Claro' })).toBeChecked();
    await again.getByRole('radio', { name: 'Escuro' }).check();
    await expect.poll(() => theme(page)).toBe('dark');
  });

  test('a tela Minha conta também tem a seção Aparência', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    await page.goto('/minha-conta');
    const section = page.getByRole('region', { name: 'Aparência' });
    await section.getByRole('radio', { name: 'Claro' }).check();
    await expect.poll(() => theme(page)).toBe('light');
  });

  test('sem flash: com tema claro gravado, o escuro nunca é aplicado nem por um instante', async ({ page }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, 'light');
      const seen: string[] = [];
      (window as unknown as { __themes: string[] }).__themes = seen;
      // o documento ainda não tem <html> neste ponto: observa o próprio documento
      new MutationObserver((records) => {
        for (const record of records) seen.push((record.target as HTMLElement).getAttribute('data-theme') ?? '');
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-theme'] });
    }, THEME_KEY);
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    const seen = await page.evaluate(() => (window as unknown as { __themes: string[] }).__themes);
    expect(seen).not.toContain('dark');
    expect(seen[0]).toBe('light');
  });

  test('em "Sistema" o tema acompanha o sistema em tempo real', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/login');
    expect(await theme(page)).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => theme(page)).toBe('dark');
  });

  test('o alternador das telas públicas muda e guarda o tema', async ({ page }) => {
    await page.goto('/login');
    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Tema: sistema. Alternar para claro');
    await toggle.click();
    await expect.poll(() => theme(page)).toBe('light');
    await expect(toggle).toHaveAttribute('aria-label', 'Tema: claro. Alternar para escuro');
    await page.reload();
    expect(await theme(page)).toBe('light');
  });

  test('uma preferência gravada inválida é ignorada', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, '"><script>'), THEME_KEY);
    await page.goto('/login');
    expect(await theme(page)).toBe('dark');
  });
});

test.describe('ilha de navegação e contraste (app)', () => {
  test('a ilha flutua com 4 itens, destaca a rota atual e fica acima da barra de gestos', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    const links = nav.getByRole('link');
    await expect(links).toHaveCount(4);
    await expect(links).toHaveText(['Painel', 'Lançamentos', 'Faturas', 'Contas']);
    await expect(links.first()).toHaveAttribute('aria-current', 'page');

    const box = (await nav.boundingBox())!;
    const view = page.viewportSize()!;
    expect(box.y + box.height).toBeLessThan(view.height - 4); // flutua, não cola na borda
    expect(box.x).toBeGreaterThan(4);
    expect(box.x + box.width).toBeLessThan(view.width - 4);
    for (const link of await links.all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    await links.nth(2).click();
    await expect(links.nth(2)).toHaveAttribute('aria-current', 'page');
    await expect(links.first()).not.toHaveAttribute('aria-current', 'page');
  });

  test('o botão Novo lançamento fica acima da ilha, sem sobrepô-la, em 360x640', async ({ page, request }) => {
    const user = await newUser(request);
    await page.setViewportSize({ width: 360, height: 640 });
    await signIn(page, user.email);
    const fab = (await page.getByRole('link', { name: 'Novo lançamento' }).boundingBox())!;
    const island = (await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox())!;
    expect(fab.y + fab.height).toBeLessThanOrEqual(island.y);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`telas principais passam no axe (WCAG AA) no tema ${scheme}`, async ({ page, request }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const user = await seed(request);
      await signIn(page, user.email);
      const problems: string[] = [];
      for (const path of ['/', '/lancamentos', '/faturas', '/contas', '/categorias', '/fluxo-de-caixa', '/minha-conta']) {
        await page.goto(path);
        await expect(page.getByText(/Carregando/)).toHaveCount(0);
        expect(await theme(page)).toBe(scheme);
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        for (const v of axe.violations) problems.push(`${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 80)}`);
      }
      await page.goto('/login');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      for (const v of axe.violations) problems.push(`/login: ${v.id} (${v.nodes.length})`);
      expect(problems).toEqual([]);
    });

    test(`/novo em cartão 10x (${scheme}): sem rolagem horizontal, alvos de 44 px e sem violações`, async ({ page, request }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const user = await seed(request);
      await signIn(page, user.email);
      await page.goto('/novo');
      await page.locator('gef-account-picker button[aria-haspopup]').click();
      await page.locator('[role="option"]').filter({ hasText: 'Nubank' }).click();
      await page.getByLabel('Parcelas').selectOption('10');
      await page.getByLabel('Data', { exact: true }).fill('2026-11-05');
      await page.getByLabel('Valor da parcela').click();
      await page.keyboard.type('10000');
      await expect(page.getByTestId('installment-card')).toBeVisible();

      const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('.gef-screen, html')).some((el) => el.scrollWidth > el.clientWidth + 1));
      expect(overflow).toBe(false);
      const small = await page.evaluate(() => {
        const found: string[] = [];
        for (const el of Array.from(document.querySelectorAll('button, a[href], select, input:not([type="hidden"]), summary'))) {
          const target = el instanceof HTMLInputElement ? (el.closest('label') ?? el) : el;
          const r = target.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.width < 43.5 || r.height < 43.5)) found.push(`${el.tagName} ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        return found;
      });
      expect(small).toEqual([]);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(axe.violations.map((v) => `${v.id} (${v.nodes.length})`)).toEqual([]);
    });
  }

  test('com contraste alto no sistema, ilha e cabeçalho voltam a ser opacos e sem desfoque', async ({ page, request }) => {
    const user = await newUser(request);
    await page.emulateMedia({ contrast: 'more' });
    await signIn(page, user.email);
    const style = await page.getByRole('navigation', { name: 'Navegação principal' }).evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, filter: s.backdropFilter };
    });
    expect(style.bg).toBe(rgb(19, 27, 46));
    expect(style.filter).toBe('none');
  });
});
