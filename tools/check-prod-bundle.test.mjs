import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-prod-bundle.mjs');
const URL_OK = 'https://api.example.com/api/v1';
const roots = [];

function makeDist(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-prod-bundle-'));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const check = (files) => run('--dist', makeDist(files), '--expect', URL_OK);

after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

test('bundle correto passa', () => {
  const result = check({ 'main.js': `const a="${URL_OK}";`, 'chunk.js': 'const b=1;' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'PASS');
});

test('URL esperada lida do environment.prod.ts', () => {
  const dist = makeDist({ 'main.js': `x("${URL_OK}")` });
  const env = join(dist, 'environment.prod.ts');
  writeFileSync(env, `export const environment = { apiUrl: '${URL_OK}' };`);
  const result = run('--dist', dist, '--env', env);
  assert.equal(result.status, 0);
});

test('falha quando a URL esperada nao aparece', () => {
  const result = check({ 'main.js': 'const a=1;' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL url-ausente/);
});

test('falha com localhost no bundle', () => {
  const result = check({ 'main.js': `"${URL_OK}";"http://localhost:8080/api/v1"` });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL endereço-local\(localhost\): .*main\.js/);
});

test('falha com 10.0.2.2 no bundle', () => {
  const result = check({ 'main.js': `"${URL_OK}";"http://10.0.2.2:8080/x"` });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL endereço-local\(10\.0\.2\.2\)/);
});

test('falha com /api/v1 relativo', () => {
  const result = check({ 'main.js': `"${URL_OK}";"/api/v1"` });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL api-relativa/);
});

test('falha com URL de API de outro host', () => {
  const result = check({ 'main.js': `"${URL_OK}";"https://outro.example.org/api/v1"` });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL api-diferente-da-esperada/);
});

test('falha com http:// no lugar de https://', () => {
  const result = check({ 'main.js': `"${URL_OK}";"http://api.example.com/api/v1"` });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL api-diferente-da-esperada/);
});

test('falha quando o diretorio nao tem .js (ignora .map)', () => {
  const result = check({ 'main.js.map': URL_OK, 'index.html': URL_OK });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL sem-js/);
});

test('procura .js em subdiretorios e nao imprime trechos do conteudo', () => {
  const result = check({ 'a/b/main.js': `"${URL_OK}";"SEGREDO localhost"` });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout, /SEGREDO/);
});

test('erros de uso retornam 2', () => {
  assert.equal(run().status, 2);
  assert.equal(run('--dist', tmpdir()).status, 2);
  assert.equal(run('--dist', tmpdir(), '--expect', 'http://x.com/api/v1').status, 2);
  assert.equal(run('--dist', tmpdir(), '--expect', 'https://x.com/outro').status, 2);
  assert.equal(run('--dist', '/nao/existe', '--expect', URL_OK).status, 2);
  assert.equal(run('--dist', tmpdir(), '--env', '/nao/existe.ts').status, 2);
  assert.equal(run('--dist', tmpdir(), '--env', 'a', '--expect', URL_OK).status, 2);
  assert.equal(run('--desconhecida').status, 2);
});
