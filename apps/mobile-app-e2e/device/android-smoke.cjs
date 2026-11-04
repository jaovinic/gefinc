#!/usr/bin/env node
/**
 * Roteiro de fumaça no aparelho Android real (USB + depuração do WebView). Cobre o que os testes no
 * navegador não alcançam: Keystore, plugins nativos, modo offline pelo estado real da rede e lembretes
 * agendados no sistema. A confirmação da digital é manual (o roteiro avisa).
 *
 * Uso: node apps/mobile-app-e2e/device/android-smoke.cjs <serial-do-adb>
 * Pré-requisitos: API em http://localhost:8080, APK debug instalado, `adb -s <serial> reverse tcp:8080 tcp:8080`.
 */
const { execSync } = require('node:child_process');
const { chromium } = require('playwright');

const serial = process.argv[2];
if (!serial) {
  console.error('Informe o serial do aparelho (adb devices).');
  process.exit(2);
}
const API = 'http://localhost:8080/api/v1';
const PACKAGE = 'com.jvtech.gefinc';
const adb = (cmd) => execSync(`adb -s ${serial} ${cmd}`, { maxBuffer: 1e8 }).toString();
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['OK', name]);
  } catch (error) {
    results.push(['FALHOU', `${name}: ${error.message.split('\n')[0]}`]);
  }
};
const post = async (path, token, body) => {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
};
const iso = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

(async () => {
  const email = `smoke.${Date.now()}@example.com`;
  const password = 'senha-forte-123';
  await post('/auth/register', null, { email, password });
  const { accessToken } = await post('/auth/login', null, { email, password });
  const itau = await post('/accounts', accessToken, { name: 'Itaú', type: 'CHECKING', holderType: 'PF' });
  const categories = await (await fetch(`${API}/categories`, { headers: { Authorization: `Bearer ${accessToken}` } })).json();
  const food = categories.find((c) => c.name === 'Alimentação').id;
  for (const [description, due] of [['Aluguel', iso(1)], ['Internet', iso(1)]]) {
    await post('/transaction-groups', accessToken, { description, recurrenceType: 'VARIABLE', totalAmount: '100.00', accountId: itau.id, categoryId: food, purchaseDate: due, firstDueDate: due });
  }

  adb('reverse tcp:8080 tcp:8080'); // a API local do computador, vista como localhost no aparelho
  adb('shell svc power stayon usb'); // a tela não apaga durante o roteiro
  adb(`shell pm grant ${PACKAGE} android.permission.POST_NOTIFICATIONS`);
  adb(`shell pm clear ${PACKAGE}`); // começa sem sessão nem dados locais
  adb(`shell pm grant ${PACKAGE} android.permission.POST_NOTIFICATIONS`);
  adb('shell input keyevent KEYCODE_WAKEUP');
  adb(`shell am start -n ${PACKAGE}/.MainActivity`);
  await new Promise((r) => setTimeout(r, 5000));
  const socket = adb('shell cat /proc/net/unix').match(/webview_devtools_remote_\d+/g).pop();
  try { adb('forward --remove tcp:9333'); } catch { /* ainda não havia */ }
  adb(`forward tcp:9333 localabstract:${socket}`);

  const browser = await chromium.connectOverCDP('http://localhost:9333');
  const page = browser.contexts()[0].pages()[0];

  await step('entra pelo app (tokens no Keystore)', async () => {
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('heading', { name: 'Painel do mês' }).waitFor({ timeout: 15000 });
  });
  await step('todas as áreas abrem pelas abas', async () => {
    for (const [tab, heading] of [['Lançamentos', 'Lançamentos'], ['Faturas', 'Faturas'], ['Contas', 'Contas e cartões'], ['Mais', 'Mais']]) {
      await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: tab }).click();
      await page.getByRole('heading', { name: heading, exact: true }).waitFor({ timeout: 8000 });
    }
  });
  await step('modo offline pelo estado real da rede (Wi-Fi e dados desligados)', async () => {
    await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Lançamentos' }).click();
    await page.getByTestId('transaction-card').first().waitFor({ timeout: 8000 });
    adb('shell svc wifi disable');
    adb('shell svc data disable');
    try {
      await page.getByTestId('offline-banner').waitFor({ timeout: 15000 });
      await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Painel' }).click();
      await page.locator('[data-indicator="total-month"]').waitFor({ timeout: 8000 });
    } finally {
      adb('shell svc wifi enable');
      adb('shell svc data enable');
    }
    await page.getByTestId('offline-banner').waitFor({ state: 'detached', timeout: 30000 });
  });
  await step('lembrete "vencem amanhã" agendado no sistema (AlarmManager)', async () => {
    await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Mais' }).click();
    await page.getByRole('main').getByRole('link', { name: 'Minha conta' }).click();
    // lista própria (gef-select): abre o gatilho do campo e escolhe a opção pelo texto exato
    const hourField = page.locator('gef-select').filter({ has: page.getByText('Horário dos lembretes', { exact: true }) });
    await hourField.locator('button[aria-haspopup="dialog"]').click();
    await hourField.getByRole('option', { name: '23h', exact: true }).click();
    await hourField.getByRole('option').first().waitFor({ state: 'detached', timeout: 5000 });
    await page.getByRole('switch', { name: 'Contas que vencem amanhã' }).check();
    await new Promise((r) => setTimeout(r, 4000));
    const alarms = adb(`shell "dumpsys alarm | grep -c ${PACKAGE} || true"`).trim();
    if (Number(alarms) < 1) throw new Error('nenhum alarme do app no sistema');
  });
  await browser.close();

  console.log('\nResultado do roteiro no aparelho', serial);
  for (const [status, name] of results) console.log(`  [${status}] ${name}`);
  console.log('\nManual: ative o bloqueio por biometria em Minha conta, mande o app para o segundo plano e confirme a digital ao voltar;');
  console.log('        confira que a miniatura em aplicativos recentes não mostra o conteúdo.');
  process.exit(results.some(([s]) => s !== 'OK') ? 1 : 0);
})().catch((error) => {
  console.error('Roteiro interrompido:', error.message);
  process.exit(1);
});
