import bcrypt from 'bcryptjs';

// 12 in real use; tests lower it (vitest.config.ts) because each round doubles the work.
const SALT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}
