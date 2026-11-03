/** Whole years since a YYYY-MM-DD birth date, or null when it is unknown. */
export function ageFrom(dateOfBirth: string | null, today = new Date()) {
  if (!dateOfBirth) return null;
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  let age = today.getFullYear() - year;
  const birthdayPassed =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!birthdayPassed) age -= 1;
  return age;
}
