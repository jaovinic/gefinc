import { chromium } from 'playwright';

const API_BASE = 'http://localhost:8080/api/v1';
const WEB_BASE = 'http://localhost:4200';
const MOBILE_BASE = 'http://localhost:8100';

const USER_EMAIL = 'joao.victor@gefinc.app';
const USER_PASSWORD = 'SenhaForte@2026';
const USER_NAME = 'João Victor';

async function seedData() {
  console.log('--- 1. Autenticação e Perfil ---');
  // Registra usuário
  const regRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD })
  });
  console.log('Status registro:', regRes.status);

  // Faz login para obter accessToken
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD })
  });
  if (!loginRes.ok) {
    throw new Error(`Falha no login: ${loginRes.status} ${await loginRes.text()}`);
  }
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log('Token obtido com sucesso!');

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // Atualiza Nome do Perfil
  await fetch(`${API_BASE}/auth/profile`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ name: USER_NAME })
  });
  console.log('Perfil atualizado para:', USER_NAME);

  // Lista categorias padrão
  const catRes = await fetch(`${API_BASE}/categories`, { headers: authHeaders });
  const categories = await catRes.json();
  const catMap = {};
  for (const c of categories) {
    catMap[c.name] = c.id;
  }
  console.log('Categorias mapeadas:', catMap);

  console.log('--- 2. Cadastrando Contas Bancárias e Cartões ---');

  // Nubank (PF)
  const nubankRes = await fetch(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Nubank PF',
      type: 'CHECKING',
      holderType: 'PF',
      icon: 'card-platinum',
      colorHex: '#820AD1',
      openingBalance: '8450.00'
    })
  });
  const nubank = await nubankRes.json();
  console.log('Conta criada:', nubank.name, 'id:', nubank.id);

  // Itaú PJ
  const itauRes = await fetch(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Itaú Empresas PJ',
      type: 'CHECKING',
      holderType: 'PJ',
      icon: 'briefcase',
      colorHex: '#EC7000',
      openingBalance: '32600.00'
    })
  });
  const itau = await itauRes.json();
  console.log('Conta criada:', itau.name, 'id:', itau.id);

  // Reserva de Emergência
  const resRes = await fetch(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Reserva & Rendimentos',
      type: 'CHECKING',
      holderType: 'PF',
      icon: 'shield',
      colorHex: '#00E599',
      openingBalance: '50000.00'
    })
  });
  const reserva = await resRes.json();
  console.log('Conta criada:', reserva.name, 'id:', reserva.id);

  // Carteira Dinheiro
  const cartRes = await fetch(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Carteira Física',
      type: 'CASH',
      icon: 'cash',
      colorHex: '#10B981',
      openingBalance: '650.00'
    })
  });
  const carteira = await cartRes.json();
  console.log('Conta criada:', carteira.name, 'id:', carteira.id);

  // Cartão Nubank Ultravioleta
  const uvRes = await fetch(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Nubank Mastercard Black',
      type: 'CREDIT_CARD',
      bankAccountId: nubank.id,
      icon: 'card-black',
      colorHex: '#2D0C5E',
      closingDay: 25,
      dueDay: 5
    })
  });
  const ultravioleta = await uvRes.json();
  console.log('Cartão criado:', ultravioleta.name, 'id:', ultravioleta.id);

  // Cartão Itaú Black
  const itauCardRes = await fetch(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Itaú Corporate Black',
      type: 'CREDIT_CARD',
      bankAccountId: itau.id,
      icon: 'card-gold',
      colorHex: '#FF6200',
      closingDay: 20,
      dueDay: 28
    })
  });
  const itauCard = await itauCardRes.json();
  console.log('Cartão criado:', itauCard.name, 'id:', itauCard.id);

  console.log('--- 3. Inserindo Lançamentos Financeiros (Novembro/2026) ---');
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = String(now.getMonth() + 1).padStart(2, '0');
  const datePrefix = `${curYear}-${curMonth}`;

  async function addGroup(data) {
    const res = await fetch(`${API_BASE}/transaction-groups`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      console.error('Erro addGroup:', await res.text());
      return null;
    }
    return await res.json();
  }

  async function payTx(txId, paymentDate) {
    const res = await fetch(`${API_BASE}/transactions/${txId}/pay`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ paymentDate })
    });
    if (!res.ok) {
      console.error('Erro payTx:', await res.text());
    }
  }

  // 1. Receita Fixa: Pro-labore Tech Lead
  const r1 = await addGroup({
    description: 'Pro-labore & Consultoria Tech Lead',
    recurrenceType: 'FIXED',
    totalAmount: '18500.00',
    totalInstallments: 1,
    accountId: itau.id,
    categoryId: catMap['Salário'],
    purchaseDate: `${datePrefix}-01`,
    firstDueDate: `${datePrefix}-05`
  });
  if (r1 && r1.transactions?.[0]) {
    await payTx(r1.transactions[0].id, `${datePrefix}-05`);
  }

  // 2. Receita Avulsa: Consultoria Especializada em Agentes IA
  const r2 = await addGroup({
    description: 'Consultoria Arquitetura Agentes IA & Cloud',
    recurrenceType: 'VARIABLE',
    totalAmount: '6400.00',
    totalInstallments: 1,
    accountId: itau.id,
    categoryId: catMap['Outras receitas'],
    purchaseDate: `${datePrefix}-03`,
    firstDueDate: `${datePrefix}-03`
  });
  if (r2 && r2.transactions?.[0]) {
    await payTx(r2.transactions[0].id, `${datePrefix}-03`);
  }

  // 3. Receita Avulsa Pendente: Dividendos FIIs & Ações
  await addGroup({
    description: 'Dividendos Carteira de Ativos & FIIs',
    recurrenceType: 'VARIABLE',
    totalAmount: '1450.80',
    totalInstallments: 1,
    accountId: nubank.id,
    categoryId: catMap['Outras receitas'],
    purchaseDate: `${datePrefix}-06`,
    firstDueDate: `${datePrefix}-15`
  });

  // 4. Despesa Fixa: Condomínio e Aluguel Loft
  const d1 = await addGroup({
    description: 'Aluguel & Condomínio Loft Central',
    recurrenceType: 'FIXED',
    totalAmount: '3200.00',
    totalInstallments: 1,
    accountId: nubank.id,
    categoryId: catMap['Moradia'],
    purchaseDate: `${datePrefix}-01`,
    firstDueDate: `${datePrefix}-05`
  });
  if (d1 && d1.transactions?.[0]) {
    await payTx(d1.transactions[0].id, `${datePrefix}-05`);
  }

  // 5. Despesa Fixa: Servidor Homelab & Cloudflare
  const d2 = await addGroup({
    description: 'Infraestrutura Homelab & Cloudflare Pro',
    recurrenceType: 'FIXED',
    totalAmount: '289.90',
    totalInstallments: 1,
    accountId: itau.id,
    categoryId: catMap['Serviços'],
    purchaseDate: `${datePrefix}-01`,
    firstDueDate: `${datePrefix}-04`
  });
  if (d2 && d2.transactions?.[0]) {
    await payTx(d2.transactions[0].id, `${datePrefix}-04`);
  }

  // 6. Despesa Fixa: Assinaturas IA (Claude Code, OpenAI, Github)
  const d3 = await addGroup({
    description: 'Assinaturas Ferramentas IA & GitHub Copilot',
    recurrenceType: 'FIXED',
    totalAmount: '510.00',
    totalInstallments: 1,
    accountId: itau.id,
    categoryId: catMap['Serviços'],
    purchaseDate: `${datePrefix}-02`,
    firstDueDate: `${datePrefix}-05`
  });
  if (d3 && d3.transactions?.[0]) {
    await payTx(d3.transactions[0].id, `${datePrefix}-05`);
  }

  // 7. Despesas Variáveis Liquidadas
  const d4 = await addGroup({
    description: 'Supermercado Especializado Pão de Açúcar',
    recurrenceType: 'VARIABLE',
    totalAmount: '920.45',
    totalInstallments: 1,
    accountId: nubank.id,
    categoryId: catMap['Alimentação'],
    purchaseDate: `${datePrefix}-04`,
    firstDueDate: `${datePrefix}-04`
  });
  if (d4 && d4.transactions?.[0]) {
    await payTx(d4.transactions[0].id, `${datePrefix}-04`);
  }

  const d5 = await addGroup({
    description: 'Jantar Restaurante Francês - Reunião Tech',
    recurrenceType: 'VARIABLE',
    totalAmount: '430.00',
    totalInstallments: 1,
    accountId: nubank.id,
    categoryId: catMap['Lazer'],
    purchaseDate: `${datePrefix}-05`,
    firstDueDate: `${datePrefix}-05`
  });
  if (d5 && d5.transactions?.[0]) {
    await payTx(d5.transactions[0].id, `${datePrefix}-05`);
  }

  // 8. Despesa Variável Pendente
  await addGroup({
    description: 'Certificação Avançada Cloud & DevOps',
    recurrenceType: 'VARIABLE',
    totalAmount: '850.00',
    totalInstallments: 1,
    accountId: itau.id,
    categoryId: catMap['Educação'],
    purchaseDate: `${datePrefix}-06`,
    firstDueDate: `${datePrefix}-22`
  });

  // 9. Compras Parceladas no Cartão de Crédito
  // MacBook Pro M3 Max em 10x no Cartão Ultravioleta
  await addGroup({
    description: 'MacBook Pro M3 Max 36GB (10x)',
    recurrenceType: 'INSTALLMENT',
    totalAmount: '16999.00',
    totalInstallments: 10,
    accountId: ultravioleta.id,
    categoryId: catMap['Compras'],
    purchaseDate: `${datePrefix}-02`
  });

  // Monitor Dell 4K 32" em 6x
  await addGroup({
    description: 'Monitor Dell UltraSharp 4K 32" (6x)',
    recurrenceType: 'INSTALLMENT',
    totalAmount: '4500.00',
    totalInstallments: 6,
    accountId: ultravioleta.id,
    categoryId: catMap['Compras'],
    purchaseDate: `${datePrefix}-01`
  });

  // Servidor Homelab Mini PC Ryzen 9 em 5x no Itaú Black
  await addGroup({
    description: 'Mini PC Server Ryzen 9 64GB RAM (5x)',
    recurrenceType: 'INSTALLMENT',
    totalAmount: '5500.00',
    totalInstallments: 5,
    accountId: itauCard.id,
    categoryId: catMap['Compras'],
    purchaseDate: `${datePrefix}-03`
  });

  // 10. Transferência entre contas
  const trRes = await fetch(`${API_BASE}/transfers`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      fromAccountId: itau.id,
      toAccountId: reserva.id,
      amount: '8000.00',
      transferDate: `${datePrefix}-05`,
      description: 'Aporte Mensal Reserva Estratégica'
    })
  });
  if (!trRes.ok) {
    console.error('Erro transfer:', await trRes.text());
  }

  console.log('Todos os lançamentos foram gerados com sucesso!');
}

async function captureScreenshots() {
  console.log('--- 4. Iniciando Captura de Screenshots com Playwright ---');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true
  });

  // --- WEB DESKTOP ---
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });

  const webPage = await desktopContext.newPage();
  
  console.log('Acessando Login Web...');
  await webPage.goto(`${WEB_BASE}/login`, { waitUntil: 'networkidle' });
  await webPage.locator('input#email').fill(USER_EMAIL);
  await webPage.locator('input#password').fill(USER_PASSWORD);
  await webPage.getByRole('button', { name: 'Entrar', exact: true }).click();
  await webPage.waitForURL(`${WEB_BASE}/`, { timeout: 10000 });
  await webPage.waitForTimeout(3000); // aguarda animação dos gráficos Chart.js

  console.log('Capturando Web Dashboard...');
  await webPage.screenshot({ path: 'docs/screenshots/01-web-dashboard.png', fullPage: false });

  console.log('Capturando Web Contas & Cartões...');
  await webPage.goto(`${WEB_BASE}/accounts`, { waitUntil: 'networkidle' });
  await webPage.waitForTimeout(2000);
  await webPage.screenshot({ path: 'docs/screenshots/02-web-accounts.png', fullPage: false });

  console.log('Capturando Web Lançamentos...');
  await webPage.goto(`${WEB_BASE}/transactions`, { waitUntil: 'networkidle' });
  await webPage.waitForTimeout(2000);
  await webPage.screenshot({ path: 'docs/screenshots/03-web-transactions.png', fullPage: false });

  console.log('Capturando Web Faturas...');
  await webPage.goto(`${WEB_BASE}/invoices`, { waitUntil: 'networkidle' });
  await webPage.waitForTimeout(2000);
  await webPage.screenshot({ path: 'docs/screenshots/04-web-invoices.png', fullPage: false });

  console.log('Capturando Web Fluxo de Caixa...');
  await webPage.goto(`${WEB_BASE}/cashflow`, { waitUntil: 'networkidle' });
  await webPage.waitForTimeout(2000);
  await webPage.screenshot({ path: 'docs/screenshots/05-web-cashflow.png', fullPage: false });

  await desktopContext.close();

  // --- MOBILE EMULATION ---
  const mobileContext = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  const mobPage = await mobileContext.newPage();
  console.log('Acessando Login Mobile...');
  await mobPage.goto(`${MOBILE_BASE}/login`, { waitUntil: 'networkidle' });
  await mobPage.locator('input#email').fill(USER_EMAIL);
  await mobPage.locator('input#password').fill(USER_PASSWORD);
  await mobPage.getByRole('button', { name: 'Entrar', exact: true }).click();
  await mobPage.waitForURL(`${MOBILE_BASE}/`, { timeout: 10000 });
  await mobPage.waitForTimeout(3000);

  console.log('Capturando Mobile Home...');
  await mobPage.screenshot({ path: 'docs/screenshots/06-mobile-home.png' });

  console.log('Capturando Mobile Lançamentos...');
  await mobPage.goto(`${MOBILE_BASE}/lancamentos`, { waitUntil: 'networkidle' });
  await mobPage.waitForTimeout(2000);
  await mobPage.screenshot({ path: 'docs/screenshots/07-mobile-transactions.png' });

  console.log('Capturando Mobile Contas...');
  await mobPage.goto(`${MOBILE_BASE}/contas`, { waitUntil: 'networkidle' });
  await mobPage.waitForTimeout(2000);
  await mobPage.screenshot({ path: 'docs/screenshots/08-mobile-accounts.png' });

  console.log('Capturando Mobile Novo Lançamento Rápido...');
  await mobPage.goto(`${MOBILE_BASE}/novo?tipo=despesa`, { waitUntil: 'networkidle' });
  await mobPage.waitForTimeout(2000);
  await mobPage.screenshot({ path: 'docs/screenshots/09-mobile-quick-expense.png' });

  await mobileContext.close();
  await browser.close();
  console.log('>>> Todas as telas capturadas com sucesso em docs/screenshots/! <<<');
}

async function run() {
  try {
    await seedData();
    await captureScreenshots();
  } catch (err) {
    console.error('Falha na execução:', err);
    process.exit(1);
  }
}

run();
