import { Page, expect, test } from '@playwright/test';
import { apiGet, apiPost, categoryId, newUser, openTab, signIn, todayIso, chooseAccount, chooseOption, fillDate } from './support';

const card = (page: Page, description: string) => page.getByTestId('transaction-card').filter({ hasText: description });

async function openNewTransaction(page: Page) {
  await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
  return page.getByRole('dialog', { name: 'Novo lançamento' }).locator('gef-group-form');
}

async function seed(request: Parameters<typeof newUser>[0]) {
  const user = await newUser(request);
  const checking = await apiPost(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING', holderType: 'PF' });
  const nubank = await apiPost(request, user, '/accounts', { name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, bankAccountId: checking.id });
  return { user, checking, nubank };
}

test.describe('lançamentos completos no celular', () => {
  test('avulso: cadastra, paga, desfaz e exclui com confirmação', async ({ page, request }) => {
    const { user } = await seed(request);
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');
    await expect(page.getByText('Nenhum lançamento neste mês')).toBeVisible();

    const form = await openNewTransaction(page);
    await form.getByLabel('Descrição ou loja').fill('Mercado');
    await chooseAccount(page, form, 'Itaú');
    await chooseOption(page, form, 'Categoria', 'Alimentação');
    await form.getByLabel('Valor').fill('15000');
    await fillDate(form.getByLabel('Data da compra'), todayIso());
    await fillDate(form.getByLabel(/vencimento/i), todayIso());
    await form.getByRole('button', { name: 'Salvar' }).click();
    await expect(card(page, 'Mercado')).toContainText('R$ 150,00');
    await expect(card(page, 'Mercado')).toContainText('Pend');

    await page.getByRole('button', { name: 'Pagar Mercado' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(card(page, 'Mercado')).toContainText('Pago');

    await page.getByRole('button', { name: 'Desfazer Mercado' }).click();
    await expect(card(page, 'Mercado')).toContainText('Pend');

    await page.getByRole('button', { name: 'Excluir Mercado' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('1 lançamento(s)');
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(card(page, 'Mercado')).toBeVisible();

    await page.getByRole('button', { name: 'Excluir Mercado' }).click();
    await dialog.getByRole('button', { name: 'Excluir "Mercado"' }).click();
    await expect(page.getByText('Nenhum lançamento neste mês')).toBeVisible();
  });

  test('fixo repete nos meses seguintes, muda de valor a partir de um mês e pode ser encerrado', async ({ page, request }) => {
    const { user } = await seed(request);
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');

    const form = await openNewTransaction(page);
    await chooseOption(page, form, 'Tipo', 'Fixo mensal');
    await form.getByLabel('Descrição ou loja').fill('Internet');
    await chooseAccount(page, form, 'Itaú');
    await chooseOption(page, form, 'Categoria', 'Serviços');
    await form.getByLabel('Valor').fill('9990');
    await fillDate(form.getByLabel('Data da compra'), todayIso());
    await fillDate(form.getByLabel(/vencimento/i), todayIso());
    await form.getByRole('button', { name: 'Salvar' }).click();
    await expect(card(page, 'Internet')).toContainText('Fixo');

    await page.getByRole('button', { name: 'Próximo mês' }).click();
    await expect(card(page, 'Internet')).toContainText('R$ 99,90');

    // muda o valor a partir do mês seguinte
    await page.getByRole('button', { name: 'Alterar valor Internet' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ação no lançamento' });
    await dialog.getByLabel('Novo valor').fill('12000');
    await dialog.getByRole('button', { name: 'Aplicar' }).click();
    await expect(card(page, 'Internet')).toContainText('R$ 120,00');
    await page.getByRole('button', { name: 'Mês anterior' }).click();
    await expect(card(page, 'Internet')).toContainText('R$ 99,90');

    // encerra no mês corrente: o seguinte fica sem a ocorrência
    await page.getByRole('button', { name: 'Encerrar Internet' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('As ocorrências pendentes depois deste mês serão removidas');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Encerrar lançamento' }).click();
    await page.getByRole('button', { name: 'Próximo mês' }).click();
    await expect(page.getByText('Nenhum lançamento neste mês')).toBeVisible();
  });

  test('parcelado no cartão mostra a prévia (33,33 / 33,33 / 33,34) e o vencimento definido pela fatura', async ({ page, request }) => {
    const { user } = await seed(request);
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');

    const form = await openNewTransaction(page);
    await chooseOption(page, form, 'Tipo', 'Parcelado');
    await form.getByLabel('Descrição ou loja').fill('Notebook');
    await chooseAccount(page, form, 'Nubank');
    await chooseOption(page, form, 'Categoria', 'Compras');
    await form.getByLabel('Valor total').fill('10000');
    await form.getByLabel('Quantidade de parcelas').fill('3');
    await fillDate(form.getByLabel('Data da compra'), '2026-11-12');
    await expect(form.getByLabel(/vencimento/i)).toHaveCount(0);
    const preview = form.getByLabel('Prévia das parcelas');
    await expect(preview).toContainText('R$ 33,33');
    await expect(preview).toContainText('R$ 33,34');
    await expect(preview).toContainText('17/12/2026');
    await form.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('dialog', { name: 'Novo lançamento' })).toHaveCount(0);

    const groups = (await apiGet(request, user, '/transactions?month=2026-12')) as { content: { amount: string; dueDate: string }[] };
    expect(groups.content.map((t) => t.amount)).toEqual(['33.33']);
    const last = (await apiGet(request, user, '/transactions?month=2027-02')) as { content: { amount: string }[] };
    expect(last.content.map((t) => t.amount)).toEqual(['33.34']);
  });

  test('filtros por status e categoria ficam no painel Filtros', async ({ page, request }) => {
    const { user, checking } = await seed(request);
    const food = await categoryId(request, user, 'Alimentação');
    const leisure = await categoryId(request, user, 'Lazer');
    for (const [description, category] of [['Mercado', food], ['Cinema', leisure]] as const) {
      await apiPost(request, user, '/transaction-groups', {
        description, recurrenceType: 'VARIABLE', totalAmount: '10.00', accountId: checking.id,
        categoryId: category, purchaseDate: todayIso(), firstDueDate: todayIso(),
      });
    }
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');
    await expect(page.getByTestId('transaction-card')).toHaveCount(2);

    await page.getByRole('button', { name: 'Filtros' }).click();
    await chooseOption(page, page, 'Categoria', 'Lazer');
    await page.getByRole('button', { name: 'Aplicar' }).click();

    await expect(page.getByTestId('transaction-card')).toHaveCount(1);
    await expect(card(page, 'Cinema')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Filtros (1)' })).toBeVisible();
  });

  test('valor zerado não salva e preserva o que foi digitado', async ({ page, request }) => {
    const { user } = await seed(request);
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');

    const form = await openNewTransaction(page);
    await form.getByLabel('Descrição ou loja').fill('Padaria');
    await chooseAccount(page, form, 'Itaú');
    await chooseOption(page, form, 'Categoria', 'Alimentação');
    await form.getByLabel('Valor').fill('0');
    await fillDate(form.getByLabel(/vencimento/i), todayIso());
    await form.getByRole('button', { name: 'Salvar' }).click();

    await expect(form.getByText('Informe um valor maior que zero.')).toBeVisible();
    await expect(form.getByLabel('Descrição ou loja')).toHaveValue('Padaria');
  });

  test('edição sobre versão antiga avisa que o registro mudou e recarrega', async ({ page, request }) => {
    const { user, checking } = await seed(request);
    const food = await categoryId(request, user, 'Alimentação');
    const group = await apiPost(request, user, '/transaction-groups', {
      description: 'Luz', recurrenceType: 'VARIABLE', totalAmount: '90.50', accountId: checking.id,
      categoryId: food, purchaseDate: todayIso(), firstDueDate: todayIso(),
    });
    await signIn(page, user.email);
    await openTab(page, 'Lançamentos');
    await expect(card(page, 'Luz')).toContainText('R$ 90,50');

    // outro dispositivo altera o valor (a versão avança) antes de a edição ser salva
    const tx = group.transactions[0];
    const patched = await request.patch(`http://localhost:8080/api/v1/transactions/${tx.id}`, {
      headers: user.headers, data: { amount: '95.00', version: tx.version },
    });
    expect(patched.ok()).toBeTruthy();

    await page.getByRole('button', { name: 'Editar Luz' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ação no lançamento' });
    await dialog.getByLabel('Valor').fill('10000');
    await dialog.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByRole('alert')).toContainText('alterado em outro dispositivo');
    await expect(card(page, 'Luz')).toContainText('R$ 95,00');
  });
});
