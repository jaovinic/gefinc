import { Page, expect, test } from '@playwright/test';
import { installNativeDoubles } from './native-doubles';
import { apiPost, categoryId, newUser, openFromMore, openTab, signIn } from './support';

interface Scheduled {
  id: number;
  at: string;
  title: string;
  body: string;
  route: string;
}

const scheduled = (page: Page) =>
  page.evaluate(() => (window as unknown as { __gefincNative: { notifications: { scheduled: Scheduled[] } } }).__gefincNative.notifications.scheduled);
const bodies = async (page: Page) => (await scheduled(page)).map((n) => n.body);

const isoDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const toggle = (page: Page, label: string) => page.getByRole('switch', { name: label });

async function seed(request: Parameters<typeof newUser>[0]) {
  const user = await newUser(request);
  const itau = await apiPost(request, user, '/accounts', { name: 'Itaú', type: 'CHECKING', holderType: 'PF' });
  const food = await categoryId(request, user, 'Alimentação');
  const create = (description: string, amount: string, due: string) =>
    apiPost(request, user, '/transaction-groups', {
      description, recurrenceType: 'VARIABLE', totalAmount: amount, accountId: itau.id, categoryId: food,
      purchaseDate: due, firstDueDate: due,
    });
  const aluguel = await create('Aluguel', '1000.00', isoDay(1));
  await create('Internet', '100.00', isoDay(1));
  await create('Luz', '90.50', isoDay(-3));
  return { user, aluguel };
}

/** O aviso "amanhã" é agendado para hoje no horário escolhido; às 23h evita já ter passado. */
async function setLateHour(page: Page) {
  await page.getByLabel('Horário dos lembretes').selectOption('23');
}

test.describe('lembretes de vencimento', () => {
  test.skip(new Date().getHours() >= 23, 'Os avisos de hoje às 23h já teriam passado');

  test('ligar "vencem amanhã" agenda o aviso só com quantidade e tipo; pagar um item atualiza; desligar cancela', async ({ page, request }) => {
    await installNativeDoubles(page);
    const { user } = await seed(request);
    await signIn(page, user.email);
    await openFromMore(page, 'Minha conta');
    await setLateHour(page);

    await toggle(page, 'Contas que vencem amanhã').check();
    await expect.poll(() => bodies(page)).toEqual(['2 contas vencem amanhã']);
    const [notification] = await scheduled(page);
    expect(notification.title).toBe('GEFINC');
    expect(JSON.stringify(notification)).not.toMatch(/Aluguel|Internet|R\$|1000|100,/);
    expect(new Date(notification.at).getHours()).toBe(23);

    // pagar um dos itens muda a contagem do aviso
    await openTab(page, 'Lançamentos');
    await page.getByRole('button', { name: 'Pagar Aluguel' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByTestId('transaction-card').filter({ hasText: 'Aluguel' })).toContainText('Pago');
    await expect.poll(() => bodies(page), { timeout: 10_000 }).toEqual(['1 conta vence amanhã']);

    await openFromMore(page, 'Minha conta');
    await toggle(page, 'Contas que vencem amanhã').uncheck();
    await expect.poll(() => bodies(page)).toEqual([]);
  });

  test('atrasados: um resumo por dia pelos próximos 7 dias', async ({ page, request }) => {
    await installNativeDoubles(page);
    const { user } = await seed(request);
    await signIn(page, user.email);
    await openFromMore(page, 'Minha conta');
    await setLateHour(page);

    await toggle(page, 'Contas atrasadas').check();

    await expect.poll(async () => (await bodies(page)).length).toBe(7);
    expect(new Set(await bodies(page))).toEqual(new Set(['1 conta atrasada']));
  });

  test('permissão negada: explica como liberar e nada é agendado', async ({ page, request }) => {
    await installNativeDoubles(page, { notifications: { permission: 'denied' } });
    const { user } = await seed(request);
    await signIn(page, user.email);
    await openFromMore(page, 'Minha conta');

    await toggle(page, 'Contas que vencem hoje').click();

    await expect(page.getByTestId('reminders-feedback')).toContainText('configurações do aparelho');
    await expect(toggle(page, 'Contas que vencem hoje')).not.toBeChecked();
    expect(await scheduled(page)).toEqual([]);
  });

  test('a permissão só é pedida ao ligar o primeiro lembrete', async ({ page, request }) => {
    await installNativeDoubles(page, { notifications: { permission: 'prompt' } });
    const { user } = await seed(request);
    await signIn(page, user.email);
    await openFromMore(page, 'Minha conta');
    await setLateHour(page);

    await toggle(page, 'Contas que vencem amanhã').check();

    await expect(toggle(page, 'Contas que vencem amanhã')).toBeChecked();
    await expect.poll(() => bodies(page)).toEqual(['2 contas vencem amanhã']);
  });

  test('tocar no aviso abre os lançamentos pendentes do mês', async ({ page, request }) => {
    await installNativeDoubles(page);
    const { user } = await seed(request);
    await signIn(page, user.email);
    await openFromMore(page, 'Minha conta');
    await setLateHour(page);
    await toggle(page, 'Contas que vencem amanhã').check();
    await expect.poll(async () => (await scheduled(page)).length).toBe(1);
    const [notification] = await scheduled(page);

    await page.evaluate(
      (route) => (window as unknown as { __gefincNative: { notifications: { tapListeners: ((r: string) => void)[] } } }).__gefincNative.notifications.tapListeners.forEach((l) => l(route)),
      notification.route,
    );

    await expect(page.getByRole('heading', { name: 'Lançamentos', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Filtros (1)' })).toBeVisible();
    await expect(page.getByTestId('transaction-card').filter({ hasText: 'Aluguel' })).toBeVisible();
  });

  test('sair da conta cancela os avisos agendados', async ({ page, request }) => {
    await installNativeDoubles(page);
    const { user } = await seed(request);
    await signIn(page, user.email);
    await openFromMore(page, 'Minha conta');
    await setLateHour(page);
    await toggle(page, 'Contas que vencem amanhã').check();
    await expect.poll(async () => (await scheduled(page)).length).toBe(1);

    await page.getByRole('button', { name: 'Sair', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible();
    await expect.poll(async () => (await scheduled(page)).length).toBe(0);
  });
});
