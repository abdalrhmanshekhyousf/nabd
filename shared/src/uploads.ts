// Upload limits, shared so the browser can refuse a file before sending it and
// the server enforces exactly the same rules.

/** Hospital logo: raster images only (SVG can carry scripts). */
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export type LogoMimeType = (typeof LOGO_MIME_TYPES)[number];

/**
 * Medical reports and results (lab results 3.5, imaging reports 3.8): PDF or
 * a photo/scan of the paper.
 */
export const REPORT_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
export const REPORT_MAX_BYTES = 10 * 1024 * 1024;

export type ReportMimeType = (typeof REPORT_MIME_TYPES)[number];
/** Any file the server keeps. */
export type StoredMimeType = LogoMimeType | ReportMimeType;

/** Imaging studies (task 3.8): up to ten images (or PDF reports) per study. */
export const IMAGING_MAX_FILES = 10;
export const IMAGING_MAX_BYTES = 15 * 1024 * 1024;
