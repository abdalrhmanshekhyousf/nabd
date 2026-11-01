import { motion, useReducedMotion, type Transition } from 'framer-motion';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LOGO_DOT, LOGO_STROKE_WIDTH, LOGO_TRACE } from './logoGeometry';

// The trace enters from far off the left edge, like a heart monitor sweep, then
// draws the N. The viewBox is widened on both sides so the mark stays centered.
const LEAD_IN_X = -136;
const SPLASH_VIEWBOX = `${LEAD_IN_X} 0 ${64 - 2 * LEAD_IN_X} 64`;
const SPLASH_TRACE = `M${LEAD_IN_X} 37 L11 37 ${LOGO_TRACE.replace(/^M/, 'L')}`;

// Timeline in seconds.
const DRAW_START = 0.2;
const DRAW_DURATION = 1.3;
const BEAT = DRAW_START + DRAW_DURATION; // the dot appears when the trace arrives
const NAME_START = BEAT + 0.3;
/** Time until the splash starts leaving; exported for tests. */
export const INTRO_DURATION_MS = 3400;
const REDUCED_DURATION_MS = 1200;

const DRAW_EASE: Transition['ease'] = [0.45, 0, 0.25, 1];
const COMET_LENGTH = 0.1;
const LATIN_NAME = 'Nabd';

type IntroSplashProps = {
  onFinish: () => void;
};

export function IntroSplash({ onFinish }: IntroSplashProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timer = window.setTimeout(
      onFinish,
      reduceMotion ? REDUCED_DURATION_MS : INTRO_DURATION_MS,
    );
    // Any click or key skips the intro.
    window.addEventListener('keydown', onFinish);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onFinish);
    };
  }, [onFinish, reduceMotion]);

  // Reduced motion: the finished composition, faded in and out.
  const at = (delay: number) => (reduceMotion ? 0 : delay);

  return (
    <motion.div
      data-testid="intro-splash"
      aria-hidden="true"
      onClick={onFinish}
      className="fixed inset-0 z-100 flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-ink text-clinic select-none"
      initial={{ clipPath: 'circle(150% at 50% 45%)', opacity: reduceMotion ? 0 : 1 }}
      animate={{ opacity: 1 }}
      exit={
        reduceMotion
          ? { opacity: 0, transition: { duration: 0.3 } }
          : {
              clipPath: 'circle(0% at 50% 45%)',
              transition: { duration: 0.75, ease: [0.7, 0, 0.3, 1] },
            }
      }
    >
      {/* Monitor grid and soft vignette */}
      <motion.div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(245_247_250/0.07)_1px,transparent_1px),linear-gradient(90deg,rgb(245_247_250/0.07)_1px,transparent_1px)] mask-[radial-gradient(ellipse_at_center,black_30%,transparent_75%)] bg-size-[32px_32px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      />

      {/* Red glow that blooms when the heart beats */}
      <motion.div
        className="pointer-events-none absolute top-[45%] left-1/2 size-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(224_52_75/0.35),transparent_65%)]"
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 1, 0.35], scale: [0.4, 1.1, 1] }}
        transition={{ delay: at(BEAT), duration: 1.2, times: [0, 0.25, 1], ease: 'easeOut' }}
      />

      <motion.div
        className="relative w-[min(54rem,175vw)]"
        initial={{ scale: 1 }}
        animate={reduceMotion ? {} : { scale: [1, 1.06, 1] }}
        transition={{ delay: BEAT, duration: 0.45, ease: 'easeOut' }}
      >
        {/* The lead-in fades in from the left edge (the mark sits right of 42%) */}
        <svg
          viewBox={SPLASH_VIEWBOX}
          className="w-full overflow-visible mask-[linear-gradient(to_right,transparent_6%,black_40%)]"
        >
          <defs>
            <filter id="intro-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g>
            {/* The trace itself */}
            <motion.path
              d={SPLASH_TRACE}
              fill="none"
              stroke="currentColor"
              strokeWidth={LOGO_STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#intro-glow)"
              initial={{ pathLength: reduceMotion ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: DRAW_START, duration: DRAW_DURATION, ease: DRAW_EASE }}
            />
            {/* Bright comet riding the tip of the trace */}
            {!reduceMotion && (
              <motion.path
                d={SPLASH_TRACE}
                pathLength={1}
                fill="none"
                stroke="white"
                strokeWidth={LOGO_STROKE_WIDTH + 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${COMET_LENGTH} 2`}
                filter="url(#intro-glow)"
                initial={{ strokeDashoffset: COMET_LENGTH, opacity: 1 }}
                animate={{ strokeDashoffset: COMET_LENGTH - 1, opacity: [1, 1, 0] }}
                transition={{
                  delay: DRAW_START,
                  duration: DRAW_DURATION,
                  ease: DRAW_EASE,
                  opacity: {
                    delay: DRAW_START,
                    duration: DRAW_DURATION + 0.15,
                    times: [0, 0.9, 1],
                  },
                }}
              />
            )}
          </g>

          {/* Shockwave rings */}
          {!reduceMotion &&
            [0, 0.18].map((offset) => (
              <motion.circle
                key={offset}
                cx={LOGO_DOT.cx}
                cy={LOGO_DOT.cy}
                r={LOGO_DOT.r}
                fill="none"
                className="stroke-pulse"
                strokeWidth={1.2}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                initial={{ scale: 1, opacity: 0 }}
                animate={{ scale: [1, 7], opacity: [0, 0.9, 0] }}
                transition={{ delay: BEAT + offset, duration: 1, ease: 'easeOut' }}
              />
            ))}

          {/* The dot: pops in like a heartbeat */}
          <motion.circle
            {...LOGO_DOT}
            className="fill-pulse"
            filter="url(#intro-glow)"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            initial={{ scale: reduceMotion ? 1 : 0 }}
            animate={reduceMotion ? { scale: 1 } : { scale: [0, 1.7, 0.9, 1.15, 1] }}
            transition={{ delay: BEAT, duration: 0.7, times: [0, 0.3, 0.55, 0.75, 1] }}
          />
        </svg>
      </motion.div>

      {/* Name: Arabic letters are joined, so the word un-blurs as one piece;
          the Latin letters arrive one by one. */}
      <div className="relative flex flex-col items-center gap-3">
        <motion.p
          lang="ar"
          className="text-6xl leading-none font-bold sm:text-7xl"
          initial={{ opacity: reduceMotion ? 1 : 0, y: 16, filter: 'blur(14px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: at(NAME_START), duration: 0.7, ease: 'easeOut' }}
        >
          نبض
        </motion.p>
        <p
          lang="en"
          dir="ltr"
          className="flex text-2xl font-light tracking-[0.45em] text-clinic/70 sm:text-3xl"
        >
          {LATIN_NAME.split('').map((letter, index) => (
            <motion.span
              key={index}
              initial={{ opacity: reduceMotion ? 1 : 0, y: 10, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: at(NAME_START + 0.3 + index * 0.08), duration: 0.45 }}
            >
              {letter}
            </motion.span>
          ))}
        </p>
        <motion.p
          className="mt-2 text-sm text-clinic/55 sm:text-base"
          initial={{ opacity: reduceMotion ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: at(NAME_START + 0.75), duration: 0.6 }}
        >
          {t('app.tagline')}
        </motion.p>
      </div>
    </motion.div>
  );
}
