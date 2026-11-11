// Regenerates the logo SVGs, favicon and PNG app icons in public/ from the mark
// geometry. Run with `npm run brand -w client` after changing logoGeometry.ts.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  LOGO_DOT,
  LOGO_STROKE_WIDTH,
  LOGO_TRACE,
  LOGO_VIEWBOX,
} from '../src/components/brand/logoGeometry.ts';

const INK = '#10223A';
const PULSE = '#E0344B';
const CLINIC = '#F5F7FA';
const ICON_SIZES = [32, 48, 96, 192, 512];

function markSvg(traceColor: string, tile?: string) {
  const background = tile ? `<rect width="64" height="64" rx="14" fill="${tile}"/>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}">${background}` +
    `<path d="${LOGO_TRACE}" fill="none" stroke="${traceColor}" stroke-width="${LOGO_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${LOGO_DOT.cx}" cy="${LOGO_DOT.cy}" r="${LOGO_DOT.r}" fill="${PULSE}"/>` +
    `</svg>\n`
  );
}

const publicDir = new URL('../public/', import.meta.url);
await mkdir(new URL('brand/', publicDir), { recursive: true });
await mkdir(new URL('icons/', publicDir), { recursive: true });

// Transparent marks for light and dark backgrounds (print, invoices, docs).
await writeFile(new URL('brand/logo-mark.svg', publicDir), markSvg(INK));
await writeFile(new URL('brand/logo-mark-on-dark.svg', publicDir), markSvg(CLINIC));

// App icon: the mark on an ink tile, readable on light and dark browser chrome.
const appIcon = markSvg(CLINIC, INK);
await writeFile(new URL('favicon.svg', publicDir), appIcon);

for (const size of ICON_SIZES) {
  await sharp(Buffer.from(appIcon), { density: 72 * (size / 64) * 4 })
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(`icons/icon-${size}.png`, publicDir)));
}

// Installed app (task 3.25): full-bleed tiles. iOS rounds the corners itself;
// Android's maskable icon keeps the mark inside the middle 80% safe zone.
function fullBleed(scale: number) {
  const offset = (64 * (1 - scale)) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}"><rect width="64" height="64" fill="${INK}"/>` +
    `<g transform="translate(${offset} ${offset}) scale(${scale})">` +
    `<path d="${LOGO_TRACE}" fill="none" stroke="${CLINIC}" stroke-width="${LOGO_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${LOGO_DOT.cx}" cy="${LOGO_DOT.cy}" r="${LOGO_DOT.r}" fill="${PULSE}"/></g></svg>\n`
  );
}
for (const [name, size, scale] of [
  ['apple-touch-icon.png', 180, 0.82],
  ['icon-maskable-512.png', 512, 0.62],
] as const) {
  await sharp(Buffer.from(fullBleed(scale)), { density: 72 * (size / 64) * 4 })
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(`icons/${name}`, publicDir)));
}

console.info(`Generated favicon.svg, 2 logo marks and ${ICON_SIZES.length + 2} PNG icons.`);
