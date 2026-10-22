import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { apiPost, categoryId, newUser, signIn, todayIso } from './support';

const SIZES = [
  { name: 'Pixel 7', width: 412, height: 915 },
  { name: 'celular pequeno (360x640)', width: 360, height: 640 },
];

/** Telas autenticadas e o título que indica que terminaram de carregar. */
const ROUTES: { path: string; ready: string | RegExp }[] = [
  { path: '/', ready: 'Painel do mês' },
  { path: '/lancamentos', ready: 'Lançamentos' },
  { path: '/faturas', ready: 'Faturas' },
  { path: '/contas', ready: 'Contas e cartões' },
  { path: '/mais', ready: 'Mais' },
  { path: '/categorias', ready: 'Categorias' },
  { path: '/fluxo-de-caixa', ready: 'Fluxo de caixa' },
  { path: '/minha-conta', ready: 'Minha conta' },
  { path: '/quick-expense', ready: 'Nova despesa' },
  { path: '/quick-income', ready: 'Nova receita' },
];

async function seed(request: Parameters<typeof newUser>[0]) {
  const user = await newUser(request);
  const itau = await apiPost(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING', holderType: 'PF' });
  const nubank = await apiPost(request, user, '/accounts', { name: 'Nubank', type: 'CREDIT_CARD', closingDay: 1, dueDay: 28, bankAccountId: itau.id });
  const food = await categoryId(request, user, 'Alimentação');
  const month = todayIso().slice(0, 7);
  for (const [description, account, due] of [['Mercado', itau, `${month}-27`], ['Tênis', nubank, null]] as const) {
    await apiPost(request, user, '/transaction-groups', {
      description, recurrenceType: 'VARIABLE', totalAmount: '150.00', accountId: account.id, categoryId: food,
      purchaseDate: `${month}-01`, ...(due ? { firstDueDate: due } : {}),
    });
  }
  return user;
}

/** Elementos tocáveis visíveis (exceto links dentro de texto corrido) menores que 44x44 px. */
async function smallTouchTargets(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const found: string[] = [];
    for (const el of Array.from(document.querySelectorAll('button, a[href], select, input:not([type="hidden"]), textarea'))) {
      if (!visible(el)) continue;
      if (el.tagName === 'A' && el.closest('p, li > span')) continue; // link no meio do texto
      // campo dentro de um rótulo que o envolve (valor em reais, caixa de seleção): o alvo é o rótulo todo
      const target = el instanceof HTMLInputElement ? (el.closest('label') ?? el) : el;
      const r = target.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) {
        found.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return found;
  });
}

for (const size of SIZES) {
  test.describe(`conforto em ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('nenhuma tela autenticada tem rolagem horizontal, alvo de toque pequeno ou violação de acessibilidade', async ({ page, request }) => {
      const user = await seed(request);
      await signIn(page, user.email);
      const problems: string[] = [];

      for (const route of ROUTES) {
        await page.goto(route.path);
        await expect(page.getByRole('heading', { name: route.ready, exact: true }).first()).toBeVisible();
        await expect(page.getByText(/Carregando/)).toHaveCount(0); // terminou de carregar

        const overflow = await page.evaluate(() => {
          const all = [document.documentElement, ...Array.from(document.querySelectorAll('main, .gef-screen'))];
          return all.some((el) => el.scrollWidth > el.clientWidth + 1);
        });
        if (overflow) problems.push(`${route.path}: rolagem horizontal`);

        for (const small of await smallTouchTargets(page)) problems.push(`${route.path}: alvo pequeno ${small}`);

        // o título da tela não pode colar na borda: pelo menos 12 px de margem de cada lado
        const edge = await page.evaluate(() => {
          const heading = document.querySelector('main h1, .gef-screen h1');
          const r = heading?.getBoundingClientRect();
          return r ? { left: Math.round(r.left), right: Math.round(window.innerWidth - r.right) } : null;
        });
        if (edge && (edge.left < 12 || edge.right < 12)) problems.push(`${route.path}: título colado na borda (${edge.left}px / ${edge.right}px)`);

        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        for (const v of axe.violations) problems.push(`${route.path}: axe ${v.id} (${v.nodes.length})`);
      }
      expect(problems).toEqual([]);
    });
  });
}

test('telas públicas (entrar, criar conta, recuperar senha) cabem em 360 px e passam no axe', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const problems: string[] = [];
  for (const path of ['/login', '/register', '/forgot-password']) {
    await page.goto(path);
    await expect(page.getByText(/Carregando/)).toHaveCount(0);
    const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('.gef-screen')).some((el) => el.scrollWidth > el.clientWidth + 1));
    if (overflow) problems.push(`${path}: rolagem horizontal`);
    for (const small of await smallTouchTargets(page)) problems.push(`${path}: alvo pequeno ${small}`);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    for (const v of axe.violations) problems.push(`${path}: axe ${v.id} (${v.nodes.length})`);
  }
  expect(problems).toEqual([]);
});

test('formulário de conta com ícones, seletor de conta e avisos cabem em 360 px, com alvos de 44 px e sem violações', async ({ page, request }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const user = await seed(request);
  await signIn(page, user.email);
  const problems: string[] = [];
  const audit = async (label: string) => {
    const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('main, .gef-screen')).some((el) => el.scrollWidth > el.clientWidth + 1));
    if (overflow) problems.push(`${label}: rolagem horizontal`);
    for (const small of await smallTouchTargets(page)) problems.push(`${label}: alvo pequeno ${small}`);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    for (const v of axe.violations) problems.push(`${label}: axe ${v.id} (${v.nodes.length})`);
  };

  await page.goto('/contas');
  await page.getByRole('button', { name: 'Nova conta' }).first().click();
  await expect(page.getByRole('radio', { name: 'Banco' })).toBeVisible();
  await audit('formulário de conta bancária');

  await page.getByLabel('Tipo').selectOption('CREDIT_CARD');
  await page.getByLabel('Conta bancária').click();
  await expect(page.getByRole('dialog', { name: 'Conta bancária' })).toBeVisible();
  await audit('seletor de conta bancária');
  await page.keyboard.press('Escape');

  await page.goto('/quick-income');
  await page.getByLabel('Conta ou cartão').click();
  await expect(page.getByRole('dialog', { name: 'Conta ou cartão' })).toBeVisible();
  await audit('seletor de conta no lançamento rápido');
  expect(problems).toEqual([]);
});
