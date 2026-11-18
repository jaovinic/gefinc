import { Locator, expect, test } from '@playwright/test';
import { register, uniqueEmail } from './support';

const AREAS: [string, RegExp][] = [
  ['Lançamentos', /\/transactions$/],
  ['Faturas', /\/invoices$/],
  ['Fluxo de caixa', /\/cashflow$/],
  ['Contas e cartões', /\/accounts$/],
  ['Transferências', /\/transfers$/],
  ['Categorias', /\/categories$/],
  ['Minha conta', /\/settings$/],
  ['Painel', /\/$/],
];

test.describe('menu lateral do web', () => {
  test('fica à esquerda com logo, ícones e a área atual destacada', async ({ page }) => {
    await register(page, uniqueEmail());
    const side = page.getByTestId('sidenav');
    await expect(side).toBeVisible();
    const box = await side.boundingBox();
    expect(box!.x).toBeLessThan(2);
    expect(box!.width).toBeGreaterThan(200);
    await expect(side.getByLabel('GEFINC, ir para o painel')).toBeVisible();

    for (const [name] of AREAS) {
      const link = side.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link.locator('svg')).toBeVisible();
    }
    await expect(side.getByRole('link', { name: 'Painel', exact: true })).toHaveAttribute('aria-current', 'page');

    await side.getByRole('link', { name: 'Lançamentos', exact: true }).click();
    await expect(page).toHaveURL(/\/transactions$/);
    await expect(side.getByRole('link', { name: 'Lançamentos', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(side.getByRole('link', { name: 'Painel', exact: true })).not.toHaveAttribute('aria-current', 'page');
  });

  test('todas as áreas são alcançadas só pelo teclado', async ({ page }) => {
    await register(page, uniqueEmail());
    for (const [name, url] of AREAS) {
      await page.getByTestId('sidenav').getByRole('link', { name, exact: true }).focus();
      await expect(page.getByTestId('sidenav').getByRole('link', { name, exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(url);
    }
  });

  test('recolhe para só ícones, mostra o nome ao focar e lembra a escolha ao recarregar', async ({ page }) => {
    await register(page, uniqueEmail());
    const side = page.getByTestId('sidenav');
    await side.getByRole('button', { name: 'Recolher menu' }).click();
    await expect(side).toHaveAttribute('data-collapsed', 'true');
    expect((await side.boundingBox())!.width).toBeLessThan(100);
    await expect(side.getByRole('link', { name: 'Faturas', exact: true })).toBeVisible();
    await side.getByRole('link', { name: 'Faturas', exact: true }).hover();
    await expect(side.getByRole('link', { name: 'Faturas', exact: true })).toHaveAttribute('data-label', 'Faturas');
    // recolhido não há rolagem horizontal e a dica não é cortada pela região que rola
    const overflow = await side.locator('.gef-sidenav-scroll').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.reload();
    await expect(page.getByTestId('sidenav')).toHaveAttribute('data-collapsed', 'true');
    await page.getByTestId('sidenav').getByRole('button', { name: 'Expandir menu' }).click();
    await expect(page.getByTestId('sidenav')).not.toHaveAttribute('data-collapsed', 'true');
  });

  test('recolhido, a dica fica à direita do menu e acompanha o item: rolagem da região, mouse e Tab abaixo da dobra', async ({ page }) => {
    await register(page, uniqueEmail());
    await page.setViewportSize({ width: 1280, height: 380 });
    const side = page.getByTestId('sidenav');
    await side.getByRole('button', { name: 'Recolher menu' }).click();
    await expect(side).toHaveAttribute('data-collapsed', 'true');
    const region = side.locator('.gef-sidenav-scroll');
    const links = region.getByRole('link');
    expect(await region.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true); // há o que rolar

    /** Topo da dica (centro, por causa do translateY(-50%)) contra o centro do item, e o lado esquerdo contra a largura do menu. */
    const tip = (link: Locator) =>
      link.evaluate((el) => {
        const style = getComputedStyle(el, '::after');
        const rect = el.getBoundingClientRect();
        return { content: style.content, top: parseFloat(style.top), left: parseFloat(style.left), center: rect.top + rect.height / 2, menuWidth: el.closest('aside')?.getBoundingClientRect().width ?? 0 };
      });
    const aligned = async (link: Locator) => {
      const m = await tip(link);
      return m.content !== 'none' && Math.abs(m.top - m.center) <= 1 && m.left >= m.menuWidth;
    };

    // 1. rola a região até o fim e passa o mouse no último item
    await region.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const last = links.last();
    await last.hover();
    await expect.poll(() => aligned(last)).toBe(true);

    // 2. com o mouse parado, rolar a região põe outro item sob o ponteiro: a dica dele aparece alinhada
    await page.mouse.wheel(0, -60);
    const hovered = region.locator('a:hover');
    await expect.poll(async () => (await hovered.count()) === 1 && (await aligned(hovered))).toBe(true);

    // 3. teclado: do topo, Tab até o último item da região (abaixo da dobra no começo)
    await region.evaluate((el) => el.scrollTo(0, 0));
    await page.mouse.move(700, 200);
    await links.first().focus();
    for (let i = 0; i < (await links.count()) - 1; i++) {
      await page.keyboard.press('Tab');
    }
    await expect(last).toBeFocused();
    await expect.poll(() => aligned(last)).toBe(true);
  });

  test('em tela estreita vira gaveta aberta por botão e fecha ao escolher uma área', async ({ page }) => {
    await register(page, uniqueEmail());
    await page.setViewportSize({ width: 800, height: 900 });
    await expect(page.getByTestId('sidenav')).toBeHidden();
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('link', { name: 'Faturas', exact: true }).click();
    await expect(page).toHaveURL(/\/invoices$/);
    await expect(drawer).toBeHidden();

    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('Minha conta e Sair ficam no rodapé; Sair volta para o login', async ({ page }) => {
    await register(page, uniqueEmail());
    const footer = page.getByTestId('sidenav-footer');
    await expect(footer.getByRole('link', { name: 'Minha conta', exact: true })).toBeVisible();
    await footer.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
