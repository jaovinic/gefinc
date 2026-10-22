/*
 * Teste de carga do GEFINC (SC-008): 1.000 usuários simultâneos nos fluxos de lançamento, painel e
 * projeção de faturas. Rode sob demanda e antes de releases (não faz parte da pipeline padrão).
 *
 * Pré-requisitos:
 *   - k6 instalado (https://grafana.com/docs/k6/latest/set-up/install-k6/);
 *   - API no ar em um ambiente parecido com o de produção. Em desenvolvimento, use o perfil `local`
 *     com `bcrypt-strength` padrão; o BCrypt é caro de propósito e pesa no cadastro dos usuários.
 *
 * Como rodar:
 *   k6 run apps/api-server/loadtest/concurrent-users.js
 *   k6 run -e BASE_URL=https://api.exemplo.com/api/v1 -e USERS=1000 apps/api-server/loadtest/concurrent-users.js
 *
 * Variáveis: BASE_URL (padrão http://localhost:8080/api/v1), USERS (padrão 1000),
 * RAMP (padrão 1m), HOLD (padrão 3m).
 *
 * Critérios: p95 abaixo de 2 s por fluxo e menos de 1% de falhas; o k6 sai com erro se algum falhar.
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080/api/v1';
const USERS = Number(__ENV.USERS || 1000);

export const options = {
  scenarios: {
    usuarios: {
      executor: 'ramping-vus',
      stages: [
        { duration: __ENV.RAMP || '1m', target: USERS },
        { duration: __ENV.HOLD || '3m', target: USERS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{flow:lancamento}': ['p(95)<2000'],
    'http_req_duration{flow:painel}': ['p(95)<2000'],
    'http_req_duration{flow:projecao}': ['p(95)<2000'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Cada usuário virtual cria a própria conta na primeira iteração e reaproveita depois. */
let session = null;

function monthOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function authHeaders() {
  return { headers: { ...JSON_HEADERS, Authorization: `Bearer ${session.token}` } };
}

function prepare() {
  const email = `carga.${__VU}.${Date.now()}@example.com`;
  const password = 'senha-de-carga-123';
  const register = http.post(`${BASE_URL}/auth/register`, JSON.stringify({ email, password }), { headers: JSON_HEADERS });
  if (!check(register, { 'cadastro 201': (r) => r.status === 201 })) {
    return null;
  }
  const login = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password }), { headers: JSON_HEADERS });
  const token = login.json('accessToken');
  const headers = { headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` } };
  const account = http.post(`${BASE_URL}/accounts`, JSON.stringify({ name: 'Conta', type: 'CHECKING' }), headers).json('id');
  const card = http.post(`${BASE_URL}/accounts`, JSON.stringify({ name: 'Cartão', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17 }), headers).json('id');
  const categories = http.get(`${BASE_URL}/categories`, headers).json();
  const category = categories.find((c) => c.type === 'EXPENSE').id;
  return { token, account, card, category };
}

export default function () {
  session = session || prepare();
  if (!session) {
    sleep(1);
    return;
  }

  group('lançamento', () => {
    const avulso = {
      description: 'Compra de carga',
      recurrenceType: 'VARIABLE',
      totalAmount: '49.90',
      accountId: session.account,
      categoryId: session.category,
      purchaseDate: today(),
      firstDueDate: today(),
    };
    const parcelado = {
      description: 'Compra parcelada de carga',
      recurrenceType: 'INSTALLMENT',
      totalAmount: '300.00',
      totalInstallments: 3,
      accountId: session.card,
      categoryId: session.category,
      purchaseDate: today(),
    };
    for (const body of [avulso, parcelado]) {
      const res = http.post(`${BASE_URL}/transaction-groups`, JSON.stringify(body), {
        ...authHeaders(),
        tags: { flow: 'lancamento' },
      });
      check(res, { 'lançamento 201': (r) => r.status === 201 });
    }
  });

  group('painel', () => {
    const res = http.get(`${BASE_URL}/dashboard?month=${monthOf(new Date())}`, {
      ...authHeaders(),
      tags: { flow: 'painel' },
    });
    check(res, { 'painel 200': (r) => r.status === 200 });
  });

  group('projeção', () => {
    const res = http.get(`${BASE_URL}/invoices/projection?from=${monthOf(new Date())}&months=12`, {
      ...authHeaders(),
      tags: { flow: 'projecao' },
    });
    check(res, { 'projeção 200': (r) => r.status === 200 });
  });

  sleep(1 + Math.random() * 2);
}
