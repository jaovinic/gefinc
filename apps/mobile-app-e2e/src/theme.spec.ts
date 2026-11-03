import AxeBuilder from '@axe-core/playwright';
import { Locator, Page, expect, test } from '@playwright/test';
import { installNativeDoubles, systemBarStyles } from './native-doubles';
import { apiPost, categoryId, newUser, openMore, settle, signIn, todayIso, chooseOption, fillDate } from './support';

const rgb = (r: number, g: number, b: number) => `rgb(${r}, ${g}, ${b})`;
const THEME_KEY = 'gefinc.ui.theme';
const GLASS_KEY = 'gefinc.ui.glass';

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset['theme']);
const glass = (page: Page) => page.evaluate(() => document.documentElement.dataset['glass']);
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const fab = (page: Page) => page.getByRole('link', { name: 'Novo lançamento' });
const backdrop = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).backdropFilter);
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

  test('a cada troca de tema o app pede às barras do sistema o estilo certo (Dark = ícones claros)', async ({ page, request }) => {
    await installNativeDoubles(page);
    const user = await newUser(request);
    await signIn(page, user.email);
    expect((await systemBarStyles(page)).at(-1)).toBe('Dark');

    const more = await openMore(page);
    await more.getByRole('radiogroup', { name: 'Aparência' }).getByRole('radio', { name: 'Claro' }).check();
    await expect.poll(async () => (await systemBarStyles(page)).at(-1)).toBe('Light');
    await more.getByRole('radiogroup', { name: 'Aparência' }).getByRole('radio', { name: 'Escuro' }).check();
    await expect.poll(async () => (await systemBarStyles(page)).at(-1)).toBe('Dark');
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

  test('o indicador de vidro desliza até a aba ativa, fica oculto fora das abas e não vaza rótulo', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    const links = nav.getByRole('link');
    const glass = nav.locator('.gef-tab-glass');
    const near = async (index: number) => {
      await settle(page);
      const g = (await glass.boundingBox())!;
      const l = (await links.nth(index).boundingBox())!;
      expect(Math.abs(g.x - l.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(g.width - l.width)).toBeLessThanOrEqual(2);
    };
    await near(0);

    await links.nth(3).click();
    await expect(links.nth(3)).toHaveAttribute('aria-current', 'page');
    await near(3);
    await links.nth(1).click();
    await expect(links.nth(1)).toHaveAttribute('aria-current', 'page');
    await near(1);

    // o rótulo nunca passa da própria aba
    for (const link of await links.all()) {
      const fits = await link.evaluate((a) => {
        const label = a.querySelector('.gef-tab-label') as HTMLElement;
        return label.scrollWidth <= label.clientWidth + 1 && label.getBoundingClientRect().right <= a.getBoundingClientRect().right + 1;
      });
      expect(fits).toBe(true);
    }

    await openMore(page).then((dialog) => dialog.getByRole('link', { name: 'Categorias' }).click());
    await expect(page).toHaveURL(/\/categorias$/);
    await expect(nav).toHaveAttribute('data-none', '');
    await settle(page);
    expect(await glass.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  });

  test('a ilha e o botão Novo lançamento desfocam de verdade por padrão, a ilha sem transform/filter, e o cabeçalho não desfoca', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    expect(await glass(page)).toBe('blur');
    const island = await nav(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return { transform: s.transform, filter: s.filter, backdrop: s.backdropFilter, isolation: s.isolation, bg: s.backgroundColor };
    });
    expect(island.transform).toBe('none');
    expect(island.filter).toBe('none');
    expect(island.backdrop).toContain('blur(12px)');
    expect(island.isolation).toBe('isolate');
    expect(island.bg).toMatch(/^rgba\(19, 27, 46, 0\.8\)$/);

    expect(await backdrop(fab(page))).toContain('blur(12px)');
    // o contêiner fixo do botão nunca leva filtro (quebraria os painéis `fixed`)
    expect(await fab(page).evaluate((el) => getComputedStyle(el.parentElement!).backdropFilter)).toBe('none');
    expect(await page.locator('header.gef-app-header').evaluate((el) => getComputedStyle(el).backdropFilter)).toBe('none');
  });

  test('o desfoque é real: o que passa atrás da ilha aparece borrado (pixels do fundo mudam com o desfoque ligado)', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    // faixa de listras de alto contraste atrás da ilha; com o desfoque, as bordas das listras se misturam
    await page.addStyleTag({ content: `body::before { background: repeating-linear-gradient(90deg, #fff 0 3px, #000 3px 6px) !important; z-index: 0 !important; }
      .gef-tabbar { background-color: rgb(128 128 128 / 0.05) !important; }` });
    const box = (await nav(page).boundingBox())!;
    const clip = { x: box.x + box.width / 2 - 40, y: box.y + 2, width: 80, height: 6 };
    const spread = async () => {
      const png = await page.screenshot({ clip });
      return page.evaluate(async (b64) => {
        const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const canvas = new OffscreenCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, image.width, image.height).data;
        let min = 255;
        let max = 0;
        for (let i = 0; i < data.length; i += 4) {
          min = Math.min(min, data[i]);
          max = Math.max(max, data[i]);
        }
        return max - min;
      }, png.toString('base64'));
    };
    const blurred = await spread();
    await page.evaluate(() => document.documentElement.setAttribute('data-glass', 'flat'));
    await expect.poll(() => backdrop(nav(page))).toBe('none');
    const sharp = await spread();
    expect(sharp).toBeGreaterThan(blurred);
  });

  test('o menu Mais desliga o desfoque: a ilha e o botão ficam sem filtro e sólidos, a escolha persiste e a ilha segue sem transform', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    const more = await openMore(page);
    const toggle = more.getByRole('switch', { name: 'Desfoque (vidro)' });
    await expect(toggle).toBeChecked();

    await toggle.uncheck();
    await expect.poll(() => glass(page)).toBe('flat');
    expect(await page.evaluate((key) => localStorage.getItem(key), GLASS_KEY)).toBe('flat');
    await page.keyboard.press('Escape');
    await expect(more).toHaveCount(0);
    expect(await backdrop(nav(page))).toBe('none');
    expect(await backdrop(fab(page))).toBe('none');
    await expect.poll(() => nav(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(19, 27, 46, 0.95)');
    expect(await nav(page).evaluate((el) => getComputedStyle(el).transform)).toBe('none');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
    expect(await glass(page)).toBe('flat');
    expect(await backdrop(nav(page))).toBe('none');
    const again = await openMore(page);
    await expect(again.getByRole('switch', { name: 'Desfoque (vidro)' })).not.toBeChecked();
    await again.getByRole('switch', { name: 'Desfoque (vidro)' }).check();
    await expect.poll(() => glass(page)).toBe('blur');
    await page.keyboard.press('Escape');
    await expect(again).toHaveCount(0);
    expect(await backdrop(nav(page))).toContain('blur');
    expect(await backdrop(fab(page))).toContain('blur');
  });

  test('Minha conta também tem o interruptor, junto do tema (Aparência)', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    await page.goto('/minha-conta');
    const section = page.getByRole('region', { name: 'Aparência' });
    await expect(section.getByRole('radiogroup')).toBeVisible();
    await section.getByRole('switch', { name: 'Desfoque (vidro)' }).uncheck();
    await expect.poll(() => glass(page)).toBe('flat');
  });

  test('um valor inválido gravado para o desfoque é ignorado (vale o padrão ligado)', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, '"><script>'), GLASS_KEY);
    await page.goto('/login');
    expect(await glass(page)).toBe('blur');
  });

  test('sem flash: com "sólido" gravado, o desfoque nunca é aplicado nem por um instante', async ({ page }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, 'flat');
      const seen: string[] = [];
      (window as unknown as { __glass: string[] }).__glass = seen;
      new MutationObserver((records) => {
        for (const record of records) seen.push((record.target as HTMLElement).getAttribute('data-glass') ?? '');
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-glass'] });
    }, GLASS_KEY);
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    const seen = await page.evaluate(() => (window as unknown as { __glass: string[] }).__glass);
    expect(seen).not.toContain('blur');
    expect(seen[0]).toBe('flat');
  });

  test('o painel abre com a ilha e o botão desfocados: o desfoque fica no fundo do painel e nenhum ancestral do painel tem filtro', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    const more = await openMore(page);
    expect(await backdrop(nav(page))).toContain('blur');
    expect(await backdrop(fab(page))).toContain('blur');
    expect(await backdrop(page.locator('.gef-sheet-backdrop'))).toContain('blur(6px)');
    expect(await backdrop(page.locator('.gef-sheet'))).toBe('none');
    const bad = await more.evaluate((panel) => {
      const found: string[] = [];
      for (let el: Element | null = panel; el; el = el.parentElement) {
        const s = getComputedStyle(el);
        if (el !== panel && el.className.toString().includes('gef-sheet-backdrop')) continue; // o fundo do painel é o dono do desfoque
        // transformação identidade (o Ionic põe `translateZ(0)` no corpo) não muda o bloco de contenção do que é `fixed` de forma útil
        const moved = s.transform !== 'none' && s.transform !== 'matrix(1, 0, 0, 1, 0, 0)';
        if (s.backdropFilter !== 'none' || s.filter !== 'none' || moved) found.push(`${el.tagName}.${el.className}`);
      }
      return found;
    });
    expect(bad).toEqual([]);
    // o painel continua fixo ao conteúdo da tela (não preso ao pai), com a ilha por baixo
    const box = (await page.locator('.gef-sheet').boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(page.viewportSize()!.height - 2);

    // sólido: o fundo do painel também perde o desfoque
    await page.evaluate(() => document.documentElement.setAttribute('data-glass', 'flat'));
    await expect.poll(() => backdrop(page.locator('.gef-sheet-backdrop'))).toBe('none');
  });

  test('ao rolar o conteúdo o desfoque desliga e a ilha fica mais opaca; ao parar o desfoque volta', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    await page.evaluate(() => {
      const main = document.querySelector('main.gef-shell-main') as HTMLElement;
      const filler = document.createElement('div');
      filler.style.height = '4000px';
      main.appendChild(filler);
      const samples: { scrolling: boolean; filter: string; bg: string }[] = [];
      (window as unknown as { __samples: typeof samples }).__samples = samples;
      main.addEventListener('scroll', () => {
        const island = document.querySelector('nav.gef-tabbar')!;
        const style = getComputedStyle(island);
        samples.push({ scrolling: document.documentElement.hasAttribute('data-scrolling'), filter: style.backdropFilter, bg: style.backgroundColor });
      }, { passive: true });
      main.scrollTop = 600;
    });
    const samples = () => page.evaluate(() => (window as unknown as { __samples: { scrolling: boolean; filter: string; bg: string }[] }).__samples);
    await expect.poll(async () => (await samples()).length).toBeGreaterThan(0);
    const first = (await samples())[0];
    expect(first.scrolling).toBe(true);
    expect(first.filter).toBe('none');
    // a cor do fundo transiciona (150 ms) até o sólido; o alvo final é checado depois
    await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-scrolling'))).toBe(false);
    expect(await backdrop(nav(page))).toContain('blur');
    expect(await backdrop(fab(page))).toContain('blur');
    await expect.poll(() => nav(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(19, 27, 46, 0.8)');
  });

  test('rolar com o desfoque desligado não marca a raiz', async ({ page, request }) => {
    const user = await newUser(request);
    await page.addInitScript((key) => localStorage.setItem(key, 'flat'), GLASS_KEY);
    await signIn(page, user.email);
    const marked = await page.evaluate(async () => {
      const main = document.querySelector('main.gef-shell-main') as HTMLElement;
      const filler = document.createElement('div');
      filler.style.height = '4000px';
      main.appendChild(filler);
      let seen = false;
      main.addEventListener('scroll', () => {
        seen ||= document.documentElement.hasAttribute('data-scrolling');
      });
      main.scrollTop = 600;
      await new Promise((resolve) => setTimeout(resolve, 400));
      return seen;
    });
    expect(marked).toBe(false);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`o véu da barra de status fica abaixo do fundo do painel e da ilha (tema ${scheme})`, async ({ page, request }) => {
      const user = await newUser(request);
      await page.emulateMedia({ colorScheme: scheme });
      await signIn(page, user.email);
      const more = await openMore(page);
      // No navegador `env(safe-area-inset-top)` vale 0 (o véu some): força uma altura e torna o véu clicável, assim
      // `elementFromPoint` devolve o dono do véu (`ion-app`, ou `body` se ele voltar a ser irmão do app) quando está por cima.
      await page.addStyleTag({ content: 'ion-app::after, body::after { height: 40px !important; pointer-events: auto !important; }' });
      const topPoint = () => page.evaluate(() => {
        const el = document.elementFromPoint(window.innerWidth / 2, 10);
        return { tag: el?.tagName.toLowerCase() ?? '', backdrop: !!el?.closest('.gef-sheet-backdrop') };
      });
      // Com o menu Mais aberto, o fundo do painel (z-50) tem de ficar por cima do véu (z-30)...
      expect((await topPoint()).backdrop).toBe(true);

      // ...e sem painel o véu existe e cobre o topo (prova que o CSS injetado vale e o teste não passa à toa).
      await page.keyboard.press('Escape');
      await expect(more).toHaveCount(0);
      expect((await topPoint()).tag).toBe('ion-app');
    });
  }

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

    for (const mode of ['blur', 'flat'] as const) {
      test(`painel, Minha conta e menu Mais passam no axe com o desfoque ${mode === 'blur' ? 'ligado' : 'desligado'} (tema ${scheme})`, async ({ page, request }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.addInitScript((args) => localStorage.setItem(args.key, args.mode), { key: GLASS_KEY, mode });
        const user = await seed(request);
        await signIn(page, user.email);
        expect(await glass(page)).toBe(mode);
        const problems: string[] = [];
        const check = async (where: string) => {
          const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
          for (const v of axe.violations) problems.push(`${where}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 80)}`);
        };
        await check('/');
        const more = await openMore(page);
        await check('menu Mais');
        await page.keyboard.press('Escape');
        await expect(more).toHaveCount(0);
        await page.goto('/minha-conta');
        await expect(page.getByRole('heading', { name: 'Minha conta', exact: true })).toBeVisible();
        await check('/minha-conta');
        expect(problems).toEqual([]);
      });
    }

    test(`/novo em cartão 10x (${scheme}): sem rolagem horizontal, alvos de 44 px e sem violações`, async ({ page, request }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const user = await seed(request);
      await signIn(page, user.email);
      await page.goto('/novo');
      await page.locator('gef-account-picker button[aria-haspopup]').click();
      await page.locator('[role="option"]').filter({ hasText: 'Nubank' }).click();
      await chooseOption(page, page, 'Parcelas', '10x');
      await fillDate(page.getByLabel('Data', { exact: true }), '2026-11-05');
      await page.getByLabel('Valor da parcela').click();
      await page.keyboard.type('10000');
      await expect(page.getByTestId('installment-card')).toBeVisible();

      const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('.gef-screen, html')).some((el) => el.scrollWidth > el.clientWidth + 1));
      expect(overflow).toBe(false);
      const small = await page.evaluate(() => {
        const found: string[] = [];
        for (const el of Array.from(document.querySelectorAll('button, a[href], [role="option"], input:not([type="hidden"]), summary'))) {
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
    expect(await backdrop(fab(page))).toBe('none');
    const more = await openMore(page);
    expect(await backdrop(page.locator('.gef-sheet-backdrop'))).toBe('none');
    await expect(more.getByRole('switch', { name: 'Desfoque (vidro)' })).toBeChecked(); // a escolha segue ligada; o sistema é que a sobrepõe
    await expect(more.getByTestId('glass-forced-notice')).toBeVisible();
  });
});
