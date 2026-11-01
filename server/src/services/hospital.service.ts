import { LOGO_MIME_TYPES, type HospitalInfoInput, type LogoMimeType } from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import {
  detectImageType,
  publicLogoUrl,
  removeFile,
  storedPath,
  storedType,
  storeFile,
} from '../lib/uploads.js';
import { HttpError } from '../middleware/errorHandler.js';

const hospitalSelect = {
  id: true,
  name: true,
  address: true,
  phone: true,
  email: true,
  logoUrl: true,
} as const;

type HospitalRow = {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string | null;
  logoUrl: string | null;
};

/** Clients get the logo's API route, never the storage key. */
function toPublic(hospital: HospitalRow) {
  return { ...hospital, logoUrl: publicLogoUrl(hospital.logoUrl) };
}

async function findOwn(db: ScopedPrisma) {
  const hospital = await db.hospital.findFirst({ select: hospitalSelect });
  if (!hospital) throw new HttpError(404, 'NOT_FOUND', 'Hospital not found');
  return hospital;
}

/** The caller's own hospital (the scoped client can't see any other). */
export async function getHospital(db: ScopedPrisma) {
  return toPublic(await findOwn(db));
}

export async function updateHospital(
  db: ScopedPrisma,
  hospitalId: string,
  info: Omit<HospitalInfoInput, 'email'> & { email: string | null },
) {
  return toPublic(
    await db.hospital.update({ where: { id: hospitalId }, data: info, select: hospitalSelect }),
  );
}

/**
 * Replaces the logo (task 1.23). The file must really be a PNG, JPEG or WebP
 * image, judged by its own bytes and matching what the browser declared.
 */
export async function uploadLogo(
  db: ScopedPrisma,
  hospitalId: string,
  file: { buffer: Buffer; mimetype: string },
) {
  const detected = detectImageType(file.buffer);
  if (
    !detected ||
    !LOGO_MIME_TYPES.includes(file.mimetype as LogoMimeType) ||
    // A JPEG sent as "image/png" is still fine; a non-image never is.
    !LOGO_MIME_TYPES.includes(detected)
  ) {
    throw new HttpError(415, 'UNSUPPORTED_FILE_TYPE', `Not an accepted image (${file.mimetype})`);
  }

  const previous = (await findOwn(db)).logoUrl;
  const key = await storeFile(`logos/${hospitalId}`, file.buffer, detected);
  try {
    const updated = await db.hospital.update({
      where: { id: hospitalId },
      data: { logoUrl: key },
      select: hospitalSelect,
    });
    await removeFile(previous);
    return toPublic(updated);
  } catch (error) {
    // Don't leave an orphan file if saving the reference failed.
    await removeFile(key);
    throw error;
  }
}

export async function deleteLogo(db: ScopedPrisma, hospitalId: string) {
  const previous = (await findOwn(db)).logoUrl;
  const updated = await db.hospital.update({
    where: { id: hospitalId },
    data: { logoUrl: null },
    select: hospitalSelect,
  });
  await removeFile(previous);
  return toPublic(updated);
}

/** Where the caller's logo is stored, for streaming it back. */
export async function logoFile(db: ScopedPrisma) {
  const { logoUrl: key } = await findOwn(db);
  const type = key ? storedType(key) : undefined;
  if (!key || !type) throw new HttpError(404, 'NOT_FOUND', 'This hospital has no logo');
  return { path: storedPath(key), type };
}
