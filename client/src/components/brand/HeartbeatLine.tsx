import { cn } from '@/lib/cn';

// One heartbeat every 200 units: baseline, P wave, the QRS spike, T wave.
const BEAT = 'h60 l8 -6 l8 6 h14 l6 10 l8 -50 l8 62 l6 -22 h22 l10 -8 l10 8 h40';
const BEATS = 6;
const TRACE = `M0 60 ${Array.from({ length: BEATS }, () => BEAT).join(' ')}`;

// A faint monitor trace with a bright pulse sweeping along it, forever. With
// reduced motion only the faint trace shows.
export function HeartbeatLine({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${BEATS * 200} 120`}
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      aria-hidden="true"
    >
      <path
        d={TRACE}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.14"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={TRACE}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="animate-ecg-sweep drop-shadow-[0_0_6px_rgb(31_158_138/0.8)] [stroke-dasharray:0.16_1.2]"
      />
    </svg>
  );
}
