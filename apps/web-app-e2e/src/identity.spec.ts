import { expect, test } from '@playwright/test';
import { register, uniqueEmail } from './support';

const rgb = (r: number, g: number, b: number) => `rgb(${r}, ${g}, ${b})`;

test.describe('identidade visual Aurora FinTech (web)', () => {
  test('telas de acesso mostram o logo, o fundo escuro, a superfície e a fonte da marca', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('gef-auth-card gef-logo svg[aria-label="GEFINC"]')).toBeVisible();
    await expect(page.locator('gef-auth-card gef-logo')).toContainText('GEFINC');

    const style = await page.evaluate(() => {
      const card = document.querySelector('gef-auth-card section') as HTMLElement;
      return {
        body: getComputedStyle(document.body).backgroundColor,
        card: getComputedStyle(card).backgroundColor,
        font: getComputedStyle(document.body).fontFamily,
        fontLoaded: document.fonts.check('16px "Plus Jakarta Sans Variable"'),
      };
    });
    expect(style.body).toBe(rgb(9, 13, 22)); // Obsidian Deep #090D16
    expect(style.card).toBe(rgb(19, 27, 46)); // Surface Slate #131B2E
    expect(style.font).toContain('Plus Jakarta Sans');
    expect(style.fontLoaded).toBe(true);
  });

  test('o botão principal usa o verde-esmeralda da marca', async ({ page }) => {
    await page.goto('/login');
    const color = await page.getByRole('button', { name: 'Entrar', exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(color).toBe(rgb(0, 229, 153));
  });

  test('a área autenticada mostra o logo no menu lateral', async ({ page }) => {
    await register(page, uniqueEmail());
    await expect(page.getByTestId('sidenav').locator('gef-logo svg[aria-label="GEFINC"]')).toBeVisible();
  });

  test('favicons, ícone de toque e manifesto estão declarados e carregam', async ({ page, request }) => {
    await page.goto('/login');
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')).map((l) => (l as HTMLLinkElement).href),
    );
    for (const name of ['favicon.ico', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'manifest.webmanifest']) {
      expect(hrefs.some((h) => h.endsWith(`/${name}`)), name).toBe(true);
    }
    for (const href of hrefs) {
      const response = await request.get(href);
      expect(response.ok(), href).toBe(true);
      expect(response.headers()['content-type'] ?? '', href).toMatch(/image|manifest|json/);
    }
    const manifest = await (await request.get(hrefs.find((h) => h.endsWith('manifest.webmanifest'))!)).json();
    expect(manifest.name).toContain('GEFINC');
    expect(manifest.theme_color).toBe('#090D16');
    for (const icon of manifest.icons as { src: string }[]) {
      expect((await request.get(new URL(icon.src, hrefs[0]).href)).ok(), icon.src).toBe(true);
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
