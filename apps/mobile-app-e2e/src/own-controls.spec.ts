import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { installNativeDoubles, pressAndroidBack } from './native-doubles';
import { apiGet, apiPost, chooseOption, newUser, selectTrigger, settle, signIn, todayIso } from './support';

/** Controles que, no Android, abrem a interface do sistema (lista, calendário, relógio, seletor de cor). */
const NATIVE_CONTROLS = 'select, input[type="date"], input[type="color"], input[type="month"], input[type="time"], input[type="datetime-local"], input[type="week"], ion-select, ion-datetime';

const nativeControls = (page: Page) => page.evaluate((selector) => document.querySelectorAll(selector).length, NATIVE_CONTROLS);

async function seed(request: Parameters<typeof newUser>[0]) {
  const user = await newUser(request);
  const itau = await apiPost(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING', holderType: 'PF' });
  await apiPost(request, user, '/accounts', { name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, bankAccountId: itau.id });
  return user;
}

/** Alvos de toque do painel aberto menores que 44 px. */
const smallTargets = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const found: string[] = [];
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.width < 43.5 || r.height < 43.5)) {
        found.push(`${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return found;
  }, selector);

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 90)}`);

test.describe('controles próprios: nada de lista, calendário ou seletor de cor do sistema', () => {
  test.beforeEach(async ({ page }) => {
    await installNativeDoubles(page);
  });

  test('nenhuma tela do app (nem os formulários em painel) usa controle nativo', async ({ page, request }) => {
    const user = await seed(request);
    await signIn(page, user.email);
    const found: string[] = [];
    const check = async (where: string) => {
      if ((await nativeControls(page)) > 0) found.push(where);
    };

    await page.goto('/novo');
    await expect(page.getByLabel('Categoria')).toBeVisible();
    await check('/novo');
    await page.goto('/lancamentos');
    await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
    await expect(page.locator('gef-group-form')).toBeVisible();
    await check('/lancamentos > Novo lançamento');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Filtros/ }).click();
    await expect(page.getByRole('dialog', { name: 'Filtros' })).toBeVisible();
    await check('/lancamentos > Filtros');
    await page.keyboard.press('Escape');
    await page.goto('/faturas');
    await check('/faturas');
    await page.goto('/categorias');
    await page.getByRole('button', { name: 'Nova categoria' }).click();
    await expect(page.getByRole('dialog', { name: 'Nova categoria' })).toBeVisible();
    await check('/categorias > Nova categoria');
    await page.keyboard.press('Escape');
    await page.goto('/contas');
    await page.getByRole('button', { name: 'Nova conta' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Nova conta' })).toBeVisible();
    await check('/contas > Nova conta');
    await page.keyboard.press('Escape');
    await page.goto('/minha-conta');
    await expect(page.getByLabel('Bloquear depois de')).toBeVisible();
    await check('/minha-conta');

    expect(found).toEqual([]);
  });

  for (const scheme of ['dark', 'light'] as const) {
    test(`lista de Parcelas (${scheme}): 24 opções de 44 px, rola, teclado escolhe e o Voltar do Android fecha`, async ({ page, request }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const user = await seed(request);
      await signIn(page, user.email);
      await page.goto('/novo');
      await page.locator('gef-account-picker button[aria-haspopup]').click();
      await page.locator('[role="option"]').filter({ hasText: 'Nubank' }).click();

      const trigger = selectTrigger(page, page, 'Parcelas');
      await expect(trigger).toContainText('À vista (1x)');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Parcelas' });
      await expect(dialog).toBeVisible();
      await settle(page);
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const options = dialog.getByRole('option');
      await expect(options).toHaveCount(24);
      await expect(options.first()).toBeFocused(); // o foco vai para a opção marcada (À vista)
      await expect(options.first()).toHaveAttribute('aria-selected', 'true');
      expect(await smallTargets(page, '[role="dialog"] [role="option"], [role="dialog"] button')).toEqual([]);
      expect(await axe(page)).toEqual([]);

      // a lista cabe na tela e rola por dentro (24 itens)
      const scroll = await dialog.getByRole('listbox').evaluate((el) => ({ scrolls: el.scrollHeight > el.clientHeight, fits: el.getBoundingClientRect().bottom <= window.innerHeight }));
      expect(scroll).toEqual({ scrolls: true, fits: true });

      // teclado: seta para baixo move o foco, Enter escolhe e fecha, devolvendo o foco ao campo
      await page.keyboard.press('ArrowDown');
      await expect(options.nth(1)).toBeFocused();
      await page.keyboard.press('End');
      await expect(options.last()).toBeFocused();
      await page.keyboard.press('Home');
      await page.keyboard.type('5');
      await expect(options.nth(4)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toContainText('5x');
      await expect(trigger).toBeFocused();

      // o botão Voltar do Android fecha a lista sem sair da tela
      await trigger.click();
      await expect(dialog).toBeVisible();
      await pressAndroidBack(page);
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toContainText('5x');
      await expect(page).toHaveURL(/\/novo/);
    });

    test(`calendário próprio (${scheme}): máscara dd/mm/aaaa, grade com alvos de 44 px, teclado, Voltar fecha e Hoje/Ontem seguem funcionando`, async ({ page, request }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const user = await seed(request);
      await signIn(page, user.email);
      await page.goto('/novo');
      const field = page.getByLabel('Data', { exact: true });

      // texto com máscara: letras são ignoradas e a data é validada
      await field.fill('');
      await field.pressSequentially('31022026');
      await expect(field).toHaveValue('31/02/2026');
      await field.blur();
      await expect(page.getByText('Informe uma data válida no formato dd/mm/aaaa.')).toBeVisible();
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await field.fill('');
      await field.pressSequentially('05/11/2026');
      await expect(field).toHaveValue('05/11/2026');
      await expect(field).not.toHaveAttribute('aria-invalid', 'true');

      // calendário
      await page.getByRole('button', { name: 'Abrir calendário' }).click();
      const dialog = page.getByRole('dialog', { name: 'Escolha a data' });
      await expect(dialog).toBeVisible();
      await settle(page);
      const grid = dialog.getByRole('grid');
      await expect(grid).toHaveAttribute('aria-label', 'novembro de 2026');
      await expect(dialog.getByRole('button', { name: '5 de novembro de 2026', exact: true })).toBeFocused();
      await expect(dialog.getByRole('gridcell', { selected: true })).toContainText('5');
      expect(await smallTargets(page, '[role="dialog"] [data-day], [role="dialog"] button')).toEqual([]);
      expect(await axe(page)).toEqual([]);
      const noOverflow = await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      expect(noOverflow).toBe(true);

      await page.keyboard.press('ArrowRight');
      await expect(dialog.getByRole('button', { name: '6 de novembro de 2026', exact: true })).toBeFocused();
      await page.keyboard.press('PageDown');
      await expect(grid).toHaveAttribute('aria-label', 'dezembro de 2026');
      await expect(dialog.getByRole('button', { name: '6 de dezembro de 2026', exact: true })).toBeFocused();

      // o Voltar do Android fecha só o calendário
      await pressAndroidBack(page);
      await expect(dialog).toHaveCount(0);
      await expect(field).toHaveValue('05/11/2026');
      await expect(page).toHaveURL(/\/novo/);

      // escolher um dia no calendário
      await page.getByRole('button', { name: 'Abrir calendário' }).click();
      await dialog.getByRole('button', { name: '20 de novembro de 2026', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(field).toHaveValue('20/11/2026');

      // atalhos Hoje e Ontem continuam, com a data lida do campo
      await page.getByRole('button', { name: 'Hoje', exact: true }).click();
      const [year, month, day] = todayIso().split('-');
      await expect(field).toHaveValue(`${day}/${month}/${year}`);
      await expect(page.getByRole('button', { name: 'Hoje', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Ontem', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Ontem', exact: true })).toHaveAttribute('aria-pressed', 'true');
    });

    test(`paleta de cores (${scheme}): grupo de opções com nome e marca, sem seletor de cor do sistema`, async ({ page, request }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const user = await seed(request);
      await signIn(page, user.email);
      await page.goto('/categorias');
      await page.getByRole('button', { name: 'Nova categoria' }).click();
      const dialog = page.getByRole('dialog', { name: 'Nova categoria' });
      await expect(dialog).toBeVisible();
      await settle(page);
      await dialog.getByLabel('Nome').fill('Pets');
      const palette = dialog.getByRole('radiogroup', { name: 'Cor' });
      await expect(palette.getByRole('radio')).toHaveCount(16);
      await expect(palette.getByRole('radio', { name: 'Cinza (#94A3B8)' })).toBeChecked();
      expect(await smallTargets(page, '[role="dialog"] [role="radio"]')).toEqual([]);
      expect(await axe(page)).toEqual([]);

      await palette.getByRole('radio', { name: 'Verde (#16A34A)' }).click();
      await expect(palette.getByRole('radio', { name: 'Verde (#16A34A)' })).toBeChecked();
      await expect(palette.getByRole('radio', { name: 'Verde (#16A34A)' }).locator('svg')).toBeVisible(); // marca além da cor
      await page.keyboard.press('ArrowRight');
      await expect(palette.getByRole('radio', { name: 'Verde-menta (#00E599)' })).toBeChecked();
      await palette.getByRole('radio', { name: 'Azul (#3B82F6)' }).click();
      await dialog.getByRole('button', { name: 'Salvar' }).click();
      await expect(dialog).toHaveCount(0);

      const created = ((await apiGet(request, user, '/categories')) as { name: string; colorHex: string }[]).find((c) => c.name === 'Pets');
      expect(created?.colorHex.toUpperCase()).toBe('#3B82F6');
      // sem seletor nativo
      expect(await nativeControls(page)).toBe(0);
    });
  }

  test('o formulário de Lançamentos usa as listas e datas próprias, e o filtro de Status escolhe pela lista', async ({ page, request }) => {
    const user = await seed(request);
    await signIn(page, user.email);
    await page.goto('/lancamentos');
    await page.getByRole('button', { name: /Filtros/ }).click();
    const filters = page.getByRole('dialog', { name: 'Filtros' });
    await chooseOption(page, filters, 'Status', 'Pagos');
    await expect(filters.getByLabel('Status')).toContainText('Pagos');
    await filters.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByRole('button', { name: 'Filtros (1)' })).toBeVisible();
  });
});
