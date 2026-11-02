const LETTERS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';

/**
 * A random 12-character password with letters and digits (no look-alikes such as
 * l/1 or O/0, since it is read out or copied to the employee).
 */
export function generatePassword(length = 12) {
  const all = LETTERS + DIGITS;
  const random = crypto.getRandomValues(new Uint32Array(length));
  const chars = Array.from(random, (value) => all[value % all.length]);
  // Guarantee at least one letter and one digit (the server requires both).
  chars[random[0] % length] = LETTERS[random[1] % LETTERS.length];
  let digitAt = random[2] % length;
  if (digitAt === random[0] % length) digitAt = (digitAt + 1) % length;
  chars[digitAt] = DIGITS[random[3] % DIGITS.length];
  return chars.join('');
}
