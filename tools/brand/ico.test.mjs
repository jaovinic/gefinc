import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildIco } from './ico.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const fakePng = (extra) => Buffer.concat([PNG_SIGNATURE, Buffer.alloc(extra, 1)]);

test('cabeçalho indica ícone com a quantidade de imagens', () => {
  const ico = buildIco([
    { size: 16, png: fakePng(4) },
    { size: 32, png: fakePng(8) },
  ]);
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 2);
});

test('cada entrada aponta para o PNG correto, com tamanho e deslocamento', () => {
  const first = fakePng(4);
  const second = fakePng(8);
  const ico = buildIco([
    { size: 16, png: first },
    { size: 48, png: second },
  ]);
  const entry = (i) => ico.subarray(6 + i * 16, 6 + (i + 1) * 16);
  assert.equal(entry(0).readUInt8(0), 16);
  assert.equal(entry(1).readUInt8(0), 48);
  assert.equal(entry(0).readUInt32LE(8), first.length);
  assert.equal(entry(1).readUInt32LE(8), second.length);
  assert.equal(entry(0).readUInt32LE(12), 6 + 2 * 16);
  assert.equal(entry(1).readUInt32LE(12), 6 + 2 * 16 + first.length);
  const start = entry(1).readUInt32LE(12);
  assert.deepEqual(ico.subarray(start, start + second.length), second);
});

test('tamanho 256 é gravado como zero, como manda o formato', () => {
  const ico = buildIco([{ size: 256, png: fakePng(2) }]);
  assert.equal(ico.readUInt8(6), 0);
});

test('recusa lista vazia e tamanhos inválidos', () => {
  assert.throws(() => buildIco([]));
  assert.throws(() => buildIco([{ size: 0, png: fakePng(1) }]));
  assert.throws(() => buildIco([{ size: 512, png: fakePng(1) }]));
});
