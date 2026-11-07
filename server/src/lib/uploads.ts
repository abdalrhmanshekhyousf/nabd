import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import type { LogoMimeType, ReportMimeType, StoredMimeType } from '@nabd/shared';
import { env } from '../config/env.js';

const EXTENSION: Record<StoredMimeType, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};
const TYPE_BY_EXTENSION = Object.fromEntries(
  Object.entries(EXTENSION).map(([type, ext]) => [ext, type]),
) as Record<string, StoredMimeType>;

/**
 * The image type according to the file's own first bytes. The name and the
 * Content-Type sent by the browser are easy to fake; the signature isn't.
 */
export function detectImageType(data: Buffer): LogoMimeType | null {
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * A medical report's type (task 3.5): a PDF or a PNG/JPEG photo of it, by its
 * own first bytes like images.
 */
export function detectReportType(data: Buffer): ReportMimeType | null {
  if (data.length >= 5 && data.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  const image = detectImageType(data);
  return image === 'image/png' || image === 'image/jpeg' ? image : null;
}

/** Absolute path of a stored file, refusing anything that escapes the uploads folder. */
export function storedPath(key: string) {
  const path = resolve(env.uploadsDir, key);
  const inside = relative(env.uploadsDir, path);
  if (inside.startsWith('..') || inside === '' || resolve(inside) === inside) {
    throw new Error(`Refusing a path outside the uploads folder: ${key}`);
  }
  return path;
}

/** Saves the bytes under a fresh random name and returns the storage key. */
export async function storeFile(folder: string, data: Buffer, type: StoredMimeType) {
  // Keys always use "/", whatever the operating system.
  const key = join(folder, `${randomUUID()}${EXTENSION[type]}`).replaceAll('\\', '/');
  const path = storedPath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  return key;
}

/** Deletes a stored file; a file that is already gone is fine. */
export async function removeFile(key: string | null) {
  if (key) await rm(storedPath(key), { force: true });
}

export function storedType(key: string): StoredMimeType | undefined {
  return TYPE_BY_EXTENSION[extname(key).toLowerCase()];
}

/**
 * What clients get instead of the storage key: the API route that serves the
 * logo, with a version so browsers and caches pick up a replaced logo.
 */
export function publicLogoUrl(key: string | null) {
  return key ? `/hospital/logo?v=${basename(key, extname(key))}` : null;
}
