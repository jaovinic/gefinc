#!/usr/bin/env node
// Verifica o bundle de produção: a URL pública da API deve estar presente e nenhum endereço local pode vazar.
// Uso: node tools/check-prod-bundle.mjs --dist <dir> (--env <environment.prod.ts> | --expect <url>)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const API_URL_IN_ENV = /apiUrl:\s*['"`]([^'"`]+)['"`]/;
const LOCAL_MARKERS = ['localhost', '10.0.2.2', '127.0.0.1'];
const RELATIVE_API = /(["'`])\/api\/v1/;
const ABSOLUTE_API = /https?:\/\/[^"'`\s\\]+\/api\/v1/g;

function usage(message) {
  console.error(`Erro de uso: ${message}`);
  console.error('Uso: node tools/check-prod-bundle.mjs --dist <dir> (--env <environment.prod.ts> | --expect <url>)');
  process.exit(2);
}

function listJs(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listJs(path));
    else if (entry.name.endsWith('.js')) files.push(path);
  }
  return files;
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      dist: { type: 'string' },
      env: { type: 'string' },
      expect: { type: 'string' },
    },
    strict: true,
  }));
} catch (error) {
  usage(error.message);
}

if (!values.dist) usage('--dist é obrigatório');
if (Boolean(values.env) === Boolean(values.expect)) usage('informe exatamente um entre --env e --expect');

let expected = values.expect;
if (values.env) {
  let source;
  try {
    source = readFileSync(values.env, 'utf8');
  } catch {
    usage(`não foi possível ler ${values.env}`);
  }
  expected = source.match(API_URL_IN_ENV)?.[1];
  if (!expected) usage(`apiUrl não encontrado em ${values.env}`);
}
if (!expected.startsWith('https://') || !expected.endsWith('/api/v1')) {
  usage('a URL esperada deve começar com https:// e terminar com /api/v1');
}

let files;
try {
  files = listJs(values.dist);
} catch {
  usage(`não foi possível ler o diretório ${values.dist}`);
}
if (files.length === 0) {
  console.log(`FAIL sem-js: ${values.dist} (0 arquivos .js)`);
  process.exit(1);
}

const failures = [];
const count = (text, needle) => text.split(needle).length - 1;
let expectedFound = 0;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  expectedFound += count(text, expected);

  for (const marker of LOCAL_MARKERS) {
    const n = count(text, marker);
    if (n > 0) failures.push(`FAIL endereço-local(${marker}): ${file} (${n} ocorrências)`);
  }

  const relative = text.match(new RegExp(RELATIVE_API, 'g'))?.length ?? 0;
  if (relative > 0) failures.push(`FAIL api-relativa: ${file} (${relative} ocorrências)`);

  const foreign = (text.match(ABSOLUTE_API) ?? []).filter((url) => url !== expected);
  if (foreign.length > 0) failures.push(`FAIL api-diferente-da-esperada: ${file} (${foreign.length} ocorrências)`);
}

if (expectedFound === 0) failures.push(`FAIL url-ausente: ${values.dist} (0 ocorrências da URL esperada)`);

if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log('PASS');
