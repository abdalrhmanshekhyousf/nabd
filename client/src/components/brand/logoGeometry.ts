// Single source of the Nabd mark: a heartbeat trace that draws the letter N and
// ends in a red dot, like the cursor of a heart monitor. Used by <NabdLogo>, the
// loading screen animation (task 1.9) and scripts/generate-brand.ts.
export const LOGO_VIEWBOX = '0 0 64 64';
export const LOGO_TRACE = 'M11 37 H19 L26 13 L44 51 L51 15';
export const LOGO_STROKE_WIDTH = 5;
export const LOGO_DOT = { cx: 51, cy: 15, r: 4.6 } as const;
