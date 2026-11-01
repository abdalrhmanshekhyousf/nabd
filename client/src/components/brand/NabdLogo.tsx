import { LOGO_DOT, LOGO_STROKE_WIDTH, LOGO_TRACE, LOGO_VIEWBOX } from './logoGeometry';

type NabdLogoProps = {
  /** Show the "نبض Nabd" wordmark next to the mark. */
  withWordmark?: boolean;
  className?: string;
};

// The trace uses currentColor so it follows the text color in light and dark mode;
// the dot is always pulse red.
export function NabdLogo({ withWordmark = false, className = '' }: NabdLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox={LOGO_VIEWBOX} className="h-[1em] w-[1em] shrink-0" aria-hidden="true">
        <path
          d={LOGO_TRACE}
          fill="none"
          stroke="currentColor"
          strokeWidth={LOGO_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle {...LOGO_DOT} className="fill-pulse" />
      </svg>
      {withWordmark ? (
        <span className="leading-none font-semibold whitespace-nowrap">
          نبض <span className="font-normal text-muted">Nabd</span>
        </span>
      ) : (
        <span className="sr-only">Nabd</span>
      )}
    </span>
  );
}
