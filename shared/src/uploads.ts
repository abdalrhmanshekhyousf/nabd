// Upload limits, shared so the browser can refuse a file before sending it and
// the server enforces exactly the same rules.

/** Hospital logo: raster images only (SVG can carry scripts). */
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export type LogoMimeType = (typeof LOGO_MIME_TYPES)[number];
