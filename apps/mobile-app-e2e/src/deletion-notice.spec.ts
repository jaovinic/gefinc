import AxeBuilder from '@axe-core/playwright';
import { Locator, Page, expect, test } from '@playwright/test';
import { PASSWORD } from './support';

async function violations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return result.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('aviso de exclusão administrativa e cancelamento no app móvel (US12)', () => {
  test('exclusão administrativa com prazo mostra aviso na tela de entrada sem opção de cancelar', async ({
    page,
  }) => {
    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 423,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          status: 423,
          code: 'ACCOUNT_DELETION_PENDING',
          title: 'Locked',
          detail: 'A exclusão desta conta foi solicitada pela administração e não pode ser cancelada.',
          deletionDate: '2026-12-15',
          origin: 'ADMIN',
          canCancel: false,
          reasonMessage: 'Encerramento por descumprimento das regras de uso.',
          supportHint: 'Entre em contato com o suporte para entender a situação da conta.',
        }),
      });
    });

    await page.goto('/login');
    await expect(page.locator('input#email')).toHaveClass(/ng-pristine/);

    await page.getByLabel('E-mail').fill('alvo.mobile@example.com');
    await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    // Aviso visível com prazo formatado, motivo genérico e orientação de suporte
    const alert = page.getByTestId('deletion-warning');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(alert).toContainText('A exclusão desta conta está agendada para 15/12/2026.');
    await expect(alert).toContainText('Encerramento por descumprimento das regras de uso.');
    await expect(alert).toContainText('Entre em contato com o suporte para entender a situação da conta.');

    // SEM o botão de autoatendimento para cancelar a exclusão
    await expect(page.getByRole('button', { name: 'Cancelar a exclusão e entrar' })).toHaveCount(0);

    // Validação de acessibilidade via axe
    expect(await violations(page), 'aviso de exclusão no login mobile').toEqual([]);
  });

  test('aviso de cancelamento de exclusão exibido de forma dispensável', async ({ page }) => {
    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 423,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          status: 423,
          code: 'ACCOUNT_DELETION_PENDING',
          title: 'Locked',
          detail: 'A exclusão desta conta está agendada.',
          deletionDate: '2026-12-25',
          origin: 'USER',
          canCancel: true,
          notices: [
            {
              id: 55,
              kind: 'DELETION_CANCELED',
              variant: 'USER_REQUEST_CONTINUES',
              originalDeletionDate: '2026-12-25',
              message:
                'A exclusão administrativa desta conta foi cancelada. A sua solicitação de exclusão continua agendada para 25/12/2026.',
            },
          ],
        }),
      });
    });

    await page.route('**/auth/notices/55/dismiss', async (route) => {
      await route.fulfill({ status: 204 });
    });

    await page.goto('/login');
    await expect(page.locator('input#email')).toHaveClass(/ng-pristine/);

    await page.getByLabel('E-mail').fill('alvo.cancel.mobile@example.com');
    await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    // Aviso de cancelamento presente
    const cancelNotice = page.getByTestId('cancellation-notice');
    await expect(cancelNotice).toBeVisible();
    await expect(cancelNotice).toHaveAttribute('role', 'alert');
    await expect(cancelNotice).toContainText('A exclusão administrativa desta conta foi cancelada');
    await expect(cancelNotice).toContainText('continua agendada para 25/12/2026');

    // Verificação de acessibilidade
    expect(await violations(page), 'aviso de cancelamento no login mobile').toEqual([]);

    // Botão Dispensar remove o aviso
    await page.getByTestId('dismiss-notice').click();
    await expect(cancelNotice).toHaveCount(0);
  });

  test('antecipação pelo administrador mostra novo prazo no login', async ({ page }) => {
    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 423,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          status: 423,
          code: 'ACCOUNT_DELETION_PENDING',
          title: 'Locked',
          detail: 'A exclusão desta conta foi solicitada pela administração e não pode ser cancelada.',
          deletionDate: '2026-11-27',
          origin: 'ADMIN',
          canCancel: false,
          reasonMessage: 'Determinação legal ou de autoridade.',
          supportHint: 'Entre em contato com o suporte para entender a situação da conta.',
        }),
      });
    });

    await page.goto('/login');
    await expect(page.locator('input#email')).toHaveClass(/ng-pristine/);

    await page.getByLabel('E-mail').fill('alvo.antecipado@example.com');
    await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    const alert = page.getByTestId('deletion-warning');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('27/11/2026');
    await expect(alert).toContainText('Determinação legal ou de autoridade.');
  });
});

test.describe('aviso de privacidade no app móvel', () => {
  test('em tela baixa o aviso rola até o botão do fim e o botão de tema não cobre o cartão', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/privacidade');
    await expect(page.getByRole('heading', { name: 'Privacidade', level: 1 })).toBeVisible();

    const screen = page.locator('.gef-screen');
    const scrolls = await screen.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrolls).toBe(true);

    const back = page.getByRole('link', { name: 'Voltar para o login' });
    await back.scrollIntoViewIfNeeded();
    await expect(back).toBeInViewport({ ratio: 1 });

    await screen.evaluate((el) => el.scrollTo(0, 0));
    const toggle = await page.locator('gef-theme-toggle').boundingBox();
    const card = await page.locator('gef-auth-card > div > section').boundingBox();
    expect(toggle && card && toggle.y + toggle.height <= card.y).toBe(true);
    const top = await page.getByRole('link', { name: 'Voltar', exact: true }).boundingBox();
    expect(top?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  });

  test('o botão de tema rola junto com o conteúdo: depois de rolar até o fim ele não fica sobre o texto do cartão', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/privacidade');
    await expect(page.getByRole('heading', { name: 'Privacidade', level: 1 })).toBeVisible();

    const screen = page.locator('.gef-screen');
    const toggle = page.locator('gef-theme-toggle');
    expect(await toggle.evaluate((el) => getComputedStyle(el).position)).toBe('absolute');
    const box = async (locator: Locator) => {
      const found = await locator.boundingBox();
      if (!found) {
        throw new Error('elemento sem caixa na tela');
      }
      return found;
    };
    const before = await box(toggle);
    const size = await box(toggle.getByRole('button'));
    expect(size.width).toBeGreaterThanOrEqual(43.5);
    expect(size.height).toBeGreaterThanOrEqual(43.5);

    await screen.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const scrolled = await screen.evaluate((el) => el.scrollTop);
    expect(scrolled).toBeGreaterThan(100);
    const after = await box(toggle);
    const card = await box(page.locator('gef-auth-card > div > section'));
    // acompanhou a rolagem (não ficou preso à janela) e não cruza o retângulo do cartão
    expect(Math.abs(before.y - after.y - scrolled)).toBeLessThanOrEqual(1);
    const overlaps = after.x < card.x + card.width && after.x + after.width > card.x && after.y < card.y + card.height && after.y + after.height > card.y;
    expect(overlaps).toBe(false);

    // de volta ao topo, o botão segue acessível e funciona
    await screen.evaluate((el) => el.scrollTo(0, 0));
    const button = page.getByTestId('theme-toggle');
    const label = await button.getAttribute('aria-label');
    await button.click();
    await expect(button).not.toHaveAttribute('aria-label', label ?? '');
  });
});
