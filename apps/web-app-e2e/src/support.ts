import { Locator, APIRequestContext, Page, expect } from '@playwright/test';

const MAILPIT = 'http://localhost:8025/api/v1';
export const PASSWORD = 'senha-forte-123';

export function uniqueEmail(): string {
  return `ana.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Espera o formulário de acesso ser ligado ao Angular (classe ng-pristine): preencher antes disso é perdido pela primeira detecção. */
async function formReady(page: Page) {
  await expect(page.locator('input#email')).toHaveClass(/ng-pristine/);
}

export async function register(page: Page, email: string, password = PASSWORD) {
  await page.goto('/register');
  await formReady(page);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByLabel('Confirme a senha').fill(password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Painel do mês' })).toBeVisible();
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await formReady(page);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

/** Procura no Mailpit o link de redefinição enviado a este e-mail. */
export async function resetLinkFor(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = await (await request.get(`${MAILPIT}/messages`)).json();
    const message = (list.messages ?? []).find((m: { To: { Address: string }[] }) =>
      m.To.some((t) => t.Address === email),
    );
    if (message) {
      const detail = await (await request.get(`${MAILPIT}/message/${message.ID}`)).json();
      const match = /http:\/\/localhost:4200\/reset-password\?token=[A-Za-z0-9_-]+/.exec(detail.Text);
      if (match) {
        return match[0];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`E-mail de redefinição não chegou para ${email}`);
}


/** Data local de hoje em ISO, como o app usa por padrão. */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Abre a tela de contas e espera a lista carregar (tabela, cartões ou estado vazio). Sem isso, contar as
 * linhas logo após o `goto` vê zero contas mesmo havendo bancárias, e o fluxo cria uma conta extra que
 * vira a primeira opção do seletor de cartão.
 */
async function openAccounts(page: Page) {
  await page.goto('/accounts');
  await expect(page.locator('table, [data-testid="account-card"], gef-empty').first()).toBeVisible();
}

/** Cadastra uma conta pela tela de contas (bancária PF, dinheiro ou cartão vinculado a uma conta bancária). */
export async function createAccount(
  page: Page,
  name: string,
  type: 'CHECKING' | 'CASH' | 'CREDIT_CARD',
  days?: { closing: number; due: number },
  options: { holder?: 'PF' | 'PJ'; bank?: string } = {},
) {
  await openAccounts(page);
  if (type === 'CREDIT_CARD' && !options.bank && (await page.getByRole('row', { name: /Conta bancária/ }).count()) === 0) {
    await createAccount(page, 'Banco base', 'CHECKING');
    await openAccounts(page);
  }
  await page.getByRole('button', { name: 'Nova conta' }).first().click();
  await chooseOption(page, page, 'Tipo', { CHECKING: 'Conta bancária', CASH: 'Dinheiro', CREDIT_CARD: 'Cartão de crédito' }[type]);
  await page.getByLabel('Nome').fill(name);
  if (type === 'CHECKING') {
    await page.locator('gef-account-form').getByLabel(options.holder === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física').check();
  }
  if (type === 'CREDIT_CARD') {
    await page.getByLabel('Conta bancária').click();
    const option = options.bank
      ? page.locator('[role="option"]').filter({ has: page.locator('[data-name]', { hasText: new RegExp(`^${options.bank}$`) }) })
      : page.locator('[role="option"]').first();
    await expect(option).toBeVisible();
    await option.click();
    await expect(page.locator('[role="option"]')).toHaveCount(0); // lista fechada: a escolha foi aplicada
    await page.getByLabel('Nome').fill(name);
  }
  if (days) {
    await page.getByLabel('Dia de fechamento da fatura').fill(String(days.closing));
    await page.getByLabel('Dia de vencimento da fatura').fill(String(days.due));
  }
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
}

/** Escolhe uma conta ou cartão no seletor com ícones (abre a lista e clica na opção pelo nome exato). */
export async function chooseAccount(page: Page, scope: Page | Locator, name: string) {
  await scope.getByLabel('Conta ou cartão').click();
  const exact = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  const option = page.locator('[role="option"]').filter({ has: page.locator('[data-name]', { hasText: exact }) });
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.locator('[role="option"]')).toHaveCount(0); // lista fechada: a escolha foi aplicada
}

/**
 * O `gef-select` com o rótulo exato dado (visível ou oculto). O gatilho tem como nome o rótulo mais o valor atual
 * ("Parcelas 1x"), então nada de `getByRole('button', { name })` com o rótulo: use este campo ou `selectTrigger`.
 */
export function selectField(page: Page, scope: Page | Locator, label: string) {
  return scope.locator('gef-select').filter({ has: page.getByText(label, { exact: true }) });
}

/** O botão que abre a lista de um `gef-select`, pelo rótulo exato do campo. */
export function selectTrigger(page: Page, scope: Page | Locator, label: string) {
  return selectField(page, scope, label).locator('button[aria-haspopup="dialog"]');
}

/**
 * Escolhe uma opção num `gef-select` (a lista própria do app, no lugar do `<select>`): acha o campo pelo rótulo
 * (visível ou oculto, exato), abre a lista e clica na opção pelo texto exato. Espera a lista fechar, o que
 * garante que a escolha foi aplicada.
 */
export async function chooseOption(page: Page, scope: Page | Locator, label: string, optionText: string) {
  const field = selectField(page, scope, label);
  await field.locator('button[aria-haspopup="dialog"]').click();
  const option = field.getByRole('option', { name: optionText, exact: true });
  await expect(option).toBeVisible();
  await option.click();
  await expect(field.getByRole('option')).toHaveCount(0);
}

/** Preenche um campo de data próprio (`gef-date-field`) com uma data ISO: o campo recebe o texto dd/mm/aaaa, como o usuário digitaria. */
export async function fillDate(field: Locator, iso: string) {
  const [year, month, day] = iso.split('-');
  await field.fill(`${day}/${month}/${year}`);
}
