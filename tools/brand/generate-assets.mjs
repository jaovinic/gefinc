/**
 * Gera os arquivos da marca (favicons, ícones de PWA, ícones do Android e do iOS, telas de abertura e
 * versões do logo para uso externo) a partir do SVG-fonte do símbolo.
 *
 *   npm run brand:generate
 *
 * Renderiza no Chromium do Playwright (já é dependência de desenvolvimento), sem ferramentas de imagem
 * externas. Para trocar o logo, substitua `packages/ui-shared/src/brand/gefinc-symbol.svg` e rode de novo.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIco } from './ico.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BG = '#090D16';
const SURFACE = '#131B2E';
const WORDMARK_TEXT = '#F1F5F9';

const symbolSvg = readFileSync(join(root, 'packages/ui-shared/src/brand/gefinc-symbol.svg'), 'utf8');
/** Conteúdo desenhado do símbolo (sem a tag svg externa), em grade 128x128. */
const symbolInner = symbolSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const fontBase64 = readFileSync(
  join(root, 'node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2'),
).toString('base64');

/** Troca o gradiente por branco (ícone monocromático e de notificação). */
const toWhite = (markup) => markup.replace(/url\(#aurora\)/g, '#FFFFFF');

/**
 * Monta um SVG quadrado de `size` px: fundo opcional (quadrado arredondado, círculo ou cheio), borda fina
 * translúcida e o símbolo centralizado ocupando `scale` da largura.
 */
function tile({ size, shape = 'none', scale = 0.62, white = false, border = false }) {
  const symbol = white ? toWhite(symbolInner) : symbolInner;
  const k = (size * scale) / 128;
  const offset = (size - 128 * k) / 2;
  const radius = shape === 'round' ? size / 2 : shape === 'rounded' ? size * 0.22 : 0;
  const background =
    shape === 'none'
      ? ''
      : `<rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>` +
        (border
          ? `<rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="${radius}" fill="none" stroke="#00E599" stroke-opacity="0.28"/>`
          : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${background}<g transform="translate(${offset} ${offset}) scale(${k})">${symbol}</g></svg>`;
}

/** Logo com o nome: o símbolo e o texto em Plus Jakarta Sans (a fonte vai embutida para a renderização). */
function wordmark({ height }) {
  const width = Math.round(height * (440 / 128));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 440 128">
<style>@font-face{font-family:'Plus Jakarta Sans Variable';src:url(data:font/woff2;base64,${fontBase64}) format('woff2');font-weight:200 800}</style>
${symbolInner}
<text x="140" y="82" font-family="'Plus Jakarta Sans Variable',sans-serif" font-size="64" font-weight="800" letter-spacing="3" fill="${WORDMARK_TEXT}">GEFINC</text></svg>`;
}

const outputs = [];
const add = (path, content) => outputs.push({ path: join(root, path), content });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

/** Renderiza um SVG em PNG com o tamanho exato; `transparent` mantém o fundo transparente. */
async function png(svg, width, height = width, transparent = true) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<html><body style="margin:0;background:${transparent ? 'transparent' : BG}">${svg}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ type: 'png', omitBackground: transparent, clip: { x: 0, y: 0, width, height } });
}

function pngSize(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) {
    throw new Error('Arquivo gerado não é PNG.');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function renderPng(path, svg, width, height = width, transparent = true) {
  const buffer = await png(svg, width, height, transparent);
  const got = pngSize(buffer);
  if (got.width !== width || got.height !== height) {
    throw new Error(`${path}: esperado ${width}x${height}, gerado ${got.width}x${got.height}`);
  }
  add(path, buffer);
  return buffer;
}

// ---------------------------------------------------------------- web e PWA (web-app e mobile-app)
for (const app of ['web-app', 'mobile-app']) {
  const pub = `apps/${app}/public`;
  const favicons = [];
  for (const size of [16, 32, 48]) {
    favicons.push({ size, png: await renderPng(`${pub}/favicon-${size}.png`, tile({ size, shape: 'rounded', scale: 0.8 }), size) });
  }
  add(`${pub}/favicon.ico`, buildIco(favicons));
  add(`${pub}/favicon.svg`, tile({ size: 64, shape: 'rounded', scale: 0.8, border: true }));
  await renderPng(`${pub}/apple-touch-icon.png`, tile({ size: 180, shape: 'full', scale: 0.62 }), 180, 180, false);
  await renderPng(`${pub}/icon-192.png`, tile({ size: 192, shape: 'rounded', scale: 0.66, border: true }), 192);
  await renderPng(`${pub}/icon-512.png`, tile({ size: 512, shape: 'rounded', scale: 0.66, border: true }), 512);
  await renderPng(`${pub}/icon-maskable-512.png`, tile({ size: 512, shape: 'full', scale: 0.56 }), 512, 512, false);
  add(
    `${pub}/manifest.webmanifest`,
    JSON.stringify(
      {
        name: 'GEFINC – Gestão Financeira Pessoal',
        short_name: 'GEFINC',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: BG,
        theme_color: BG,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      null,
      2,
    ) + '\n',
  );
}

// ---------------------------------------------------------------- Android
const res = 'apps/mobile-app/android/app/src/main/res';
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, factor] of Object.entries(densities)) {
  const legacy = Math.round(48 * factor);
  const adaptive = Math.round(108 * factor);
  await renderPng(`${res}/mipmap-${name}/ic_launcher.png`, tile({ size: legacy, shape: 'rounded', scale: 0.66, border: true }), legacy);
  await renderPng(`${res}/mipmap-${name}/ic_launcher_round.png`, tile({ size: legacy, shape: 'round', scale: 0.6 }), legacy);
  await renderPng(`${res}/mipmap-${name}/ic_launcher_foreground.png`, tile({ size: adaptive, shape: 'none', scale: 0.5 }), adaptive);
  await renderPng(`${res}/mipmap-${name}/ic_launcher_monochrome.png`, tile({ size: adaptive, shape: 'none', scale: 0.5, white: true }), adaptive);
}
add(
  `${res}/mipmap-anydpi-v26/ic_launcher.xml`,
  `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`,
);
add(
  `${res}/mipmap-anydpi-v26/ic_launcher_round.xml`,
  `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`,
);
add(
  `${res}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG}</color>
</resources>
`,
);

// ---------------------------------------------------------------- telas de abertura (mesmo tamanho dos arquivos atuais)
function existingSize(absolute) {
  const header = readFileSync(absolute).subarray(0, 24);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}
function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const splashFiles = [
  ...walk(join(root, res)).filter((f) => f.endsWith('/splash.png')),
  ...walk(join(root, 'apps/mobile-app/ios/App/App/Assets.xcassets/Splash.imageset')).filter((f) => f.endsWith('.png')),
];
for (const absolute of splashFiles) {
  const { width, height } = existingSize(absolute);
  const logo = Math.round(Math.min(width, height) * 0.34);
  const left = Math.round((width - logo) / 2);
  const top = Math.round((height - logo) / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${BG}"/><g transform="translate(${left} ${top}) scale(${logo / 128})">${symbolInner}</g></svg>`;
  await renderPng(absolute.replace(`${root}/`, ''), svg, width, height, false);
}

// ---------------------------------------------------------------- iOS (ícone 1024, sem transparência)
await renderPng(
  'apps/mobile-app/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
  tile({ size: 1024, shape: 'full', scale: 0.62 }),
  1024,
  1024,
  false,
);

// ---------------------------------------------------------------- logo para uso externo (docs/brand)
add('docs/brand/gefinc-symbol.svg', symbolSvg);
add('docs/brand/gefinc-wordmark.svg', readFileSync(join(root, 'packages/ui-shared/src/brand/gefinc-wordmark.svg'), 'utf8'));
await renderPng('docs/brand/gefinc-symbol-512.png', tile({ size: 512, shape: 'none', scale: 0.9 }), 512);
await renderPng('docs/brand/gefinc-app-icon-1024.png', tile({ size: 1024, shape: 'rounded', scale: 0.62, border: true }), 1024);
await renderPng('docs/brand/gefinc-wordmark-1200.png', wordmark({ height: 350 }), 1202, 350, false);

await browser.close();

for (const { path, content } of outputs) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
console.log(`Marca gerada: ${outputs.length} arquivos.`);
