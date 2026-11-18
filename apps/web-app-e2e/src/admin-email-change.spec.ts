import AxeBuilder from '@axe-core/playwright';
import { APIRequestContext, Page, expect, test } from '@playwright/test';
import { API, PASSWORD, promoteToRoot, register } from './support';

/** Falhas de acessibilidade graves (WCAG 2 A e AA) da página aberta. */
async function violations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return result.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

async function createUser(request: APIRequestContext, email: string) {
  const response = await request.post(`${API}/auth/register`, {
    data: { email, password: PASSWORD },
    headers: { 'X-Client': 'web' },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).id as number;
}

const dialog = (page: Page) => page.getByRole('alertdialog');
const confirm = (page: Page) => page.getByTestId('confirm-confirm');

test.describe('painel: troca de e-mail administrativa', () => {
  let stamp: string;
  let rootEmail: string;
  let userEmail: string;
  let userId: number;

  test.beforeEach(async ({ page, request }) => {
    stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    rootEmail = `raiz.${stamp}@example.com`;
    userEmail = `alvo.${stamp}@example.com`;
    await register(page, rootEmail);
    promoteToRoot(rootEmail);
    userId = await createUser(request, userEmail);
    await page.goto(`/admin/users/${userId}`);
    await expect(page.getByTestId('detail-heading')).toBeVisible();
  });

  test('solicitar troca de e-mail abre diálogo com prova de posse, valida e exibe pendência com opção de cancelamento', async ({
    page,
  }) => {
    // 1. Abrir diálogo de troca de e-mail
    await page.getByTestId('action-email-change').click();
    await expect(dialog(page)).toBeVisible();
    await expect(page.getByTestId('dialog-effect')).toContainText('código numérico de 6 dígitos');
    expect(await violations(page)).toEqual([]);

    // 2. Validação de campo vazio / inválido
    await confirm(page).click();
    await expect(page.getByTestId('email-error')).toContainText('Informe um endereço de e-mail válido');

    // 3. Preencher novo e-mail e solicitar
    const newEmail = `novo.${stamp}@teste.com`;
    await page.getByTestId('email-input').fill(newEmail);
    await confirm(page).click();

    // 4. O diálogo segue para o passo 2 (código de confirmação); ao fechar, a pendência fica no detalhe
    const step2 = page.getByRole('alertdialog', { name: 'Confirmar troca de e-mail' });
    await expect(step2).toBeVisible();
    await expect(step2.getByTestId('confirm-confirm')).toHaveText('Confirmar troca de e-mail');
    expect(await violations(page), 'passo 2 da troca de e-mail').toEqual([]);
    await step2.getByTestId('confirm-cancel').click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('pending-email-change')).toBeVisible();
    await expect(page.getByTestId('pending-new-email')).toHaveText(newEmail);

    // 5. Cancelar troca pendente
    await page.getByTestId('cancel-email-change-btn').click();
    await expect(page.getByTestId('pending-email-change')).toBeHidden();
  });
});
