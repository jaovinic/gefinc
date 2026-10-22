import { APIRequestContext, Page, expect } from '@playwright/test';

const MAILPIT = 'http://localhost:8025/api/v1';
export const PASSWORD = 'senha-forte-123';

export function uniqueEmail(): string {
  return `ana.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
}

export async function register(page: Page, email: string, password = PASSWORD) {
  await page.goto('/register');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByLabel('Confirme a senha').fill(password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Tudo pronto para começar')).toBeVisible();
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
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

/** Cadastra uma conta pela tela de contas. */
export async function createAccount(
  page: Page,
  name: string,
  type: 'CHECKING' | 'CASH' | 'CREDIT_CARD',
  days?: { closing: number; due: number },
) {
  await page.goto('/accounts');
  await page.getByRole('button', { name: 'Nova conta' }).first().click();
  await page.getByLabel('Nome').fill(name);
  await page.getByLabel('Tipo').selectOption(type);
  if (days) {
    await page.getByLabel('Dia de fechamento da fatura').fill(String(days.closing));
    await page.getByLabel('Dia de vencimento da fatura').fill(String(days.due));
  }
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
}
