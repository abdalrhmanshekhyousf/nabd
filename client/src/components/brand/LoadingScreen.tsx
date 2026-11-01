import { LOGO_DOT, LOGO_STROKE_WIDTH, LOGO_TRACE, LOGO_VIEWBOX } from './logoGeometry';

type LoadingScreenProps = {
  /** Cover the whole viewport (app boot) or just fill the parent (a page or panel). */
  fullScreen?: boolean;
};

// The heartbeat trace draws itself, then the dot keeps pulsing like a monitor
// cursor. Pure CSS, so it runs even while the main thread is busy loading.
export function LoadingScreen({ fullScreen = true }: LoadingScreenProps) {
  return (
    <div
      role="status"
      // Placeholder text until i18next is set up in task 1.11.
      aria-label="جاري التحميل"
      className={`flex items-center justify-center bg-background text-foreground ${
        fullScreen ? 'fixed inset-0 z-50' : 'h-full min-h-48 w-full'
      }`}
    >
      <svg viewBox={LOGO_VIEWBOX} className="size-20 overflow-visible" aria-hidden="true">
        <path
          d={LOGO_TRACE}
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth={LOGO_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-trace-draw [stroke-dasharray:1] [stroke-dashoffset:1]"
        />
        <circle
          {...LOGO_DOT}
          className="origin-center animate-dot-ripple fill-pulse opacity-0 [transform-box:fill-box]"
        />
        <circle
          {...LOGO_DOT}
          className="origin-center animate-dot-beat fill-pulse opacity-0 [transform-box:fill-box]"
        />
      </svg>
    </div>
  );
}
