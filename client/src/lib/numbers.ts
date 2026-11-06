/** Arabic-Indic (٠–٩) and Persian (۰–۹) digits as Latin ones. */
export function latinDigits(text: string) {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * A count typed into a text field: any digits, spaces ignored. Empty gives
 * NaN, so the schema says "required"; anything else that is not a number too.
 */
export function readCount(text: string) {
  const clean = latinDigits(text).replace(/\s/g, '');
  return clean === '' || !/^-?\d+$/.test(clean) ? Number.NaN : Number(clean);
}
