import { expect, test } from '@playwright/test';
import { newUser, signIn } from './support';

const rgb = (r: number, g: number, b: number) => `rgb(${r}, ${g}, ${b})`;

test.describe('identidade visual Aurora FinTech (app)', () => {
  test('telas de acesso mostram o logo, o fundo escuro (padrão da suíte) e a fonte da marca', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('gef-auth-card gef-logo svg[aria-label="GEFINC"]')).toBeVisible();
    const style = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      font: getComputedStyle(document.body).fontFamily,
      fontLoaded: document.fonts.check('16px "Plus Jakarta Sans Variable"'),
    }));
    expect(style.body).toBe(rgb(9, 13, 22));
    expect(style.font).toContain('Plus Jakarta Sans');
    expect(style.fontLoaded).toBe(true);
  });

  test('o cabeçalho do app mostra o logo e a barra de abas usa o conjunto único de ícones', async ({ page, request }) => {
    const user = await newUser(request);
    await signIn(page, user.email);
    await expect(page.locator('header gef-logo svg[aria-label="GEFINC"]')).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link');
    await expect(tabs).toHaveCount(4);
    for (const tab of await tabs.all()) {
      await expect(tab.locator('gef-icon svg')).toBeVisible();
    }
    await expect(tabs.first()).toHaveAttribute('aria-current', 'page');
  });

  test('favicons, ícone de toque e manifesto estão declarados e carregam', async ({ page, request }) => {
    await page.goto('/login');
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')).map((l) => (l as HTMLLinkElement).href),
    );
    for (const name of ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'manifest.webmanifest']) {
      expect(hrefs.some((h) => h.endsWith(`/${name}`)), name).toBe(true);
    }
    for (const href of hrefs) {
      expect((await request.get(href)).ok(), href).toBe(true);
    }
  });

  test('com movimento reduzido ligado no sistema, transições e animações somem', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/login');
    const durations = await page.getByRole('button', { name: 'Entrar', exact: true }).evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.transitionDuration, s.animationDuration];
    });
    for (const value of durations.flatMap((d) => d.split(','))) {
      expect(parseFloat(value)).toBeLessThanOrEqual(0.001);
    }
  });
});
