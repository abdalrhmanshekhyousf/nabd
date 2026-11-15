/** Syrian pounds, whole, in the user's language: "53,000 ل.س" / "SYP 53,000". */
export function formatMoney(amount: number, language: string) {
  const number = new Intl.NumberFormat(language.startsWith('ar') ? 'ar-SY' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(amount);
  return language.startsWith('ar') ? `${number} ل.س` : `SYP ${number}`;
}
