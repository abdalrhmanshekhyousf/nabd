import { useSoundStore } from '@/stores/soundStore';

// Nabd's sounds are synthesized with the Web Audio API: no audio files to load or
// license, and they share one calm, monitor-like character. Browsers only allow
// audio after the first user gesture, so nothing plays before that.

export type SoundName =
  'tap' | 'toggle' | 'open' | 'close' | 'success' | 'error' | 'warning' | 'notify' | 'urgent';

/** Interface sounds follow the "UI sounds" setting; the rest only the master switch. */
const UI_SOUNDS: ReadonlySet<SoundName> = new Set(['tap', 'toggle', 'open', 'close']);

type Tone = {
  freq: number;
  /** Seconds from the start of the sound. */
  at: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Slide the pitch to this frequency over the tone. */
  glideTo?: number;
};

// Each sound is a few short tones with soft attack and decay.
const SOUNDS: Record<SoundName, Tone[]> = {
  tap: [{ freq: 880, glideTo: 660, at: 0, duration: 0.05, gain: 0.04 }],
  toggle: [
    { freq: 620, at: 0, duration: 0.06, gain: 0.05 },
    { freq: 930, at: 0.07, duration: 0.08, gain: 0.05 },
  ],
  open: [{ freq: 320, glideTo: 560, at: 0, duration: 0.14, type: 'triangle', gain: 0.045 }],
  close: [{ freq: 560, glideTo: 320, at: 0, duration: 0.12, type: 'triangle', gain: 0.04 }],
  success: [
    { freq: 659, at: 0, duration: 0.14, gain: 0.11 },
    { freq: 988, at: 0.11, duration: 0.24, gain: 0.11 },
  ],
  error: [
    { freq: 392, at: 0, duration: 0.16, type: 'triangle', gain: 0.13 },
    { freq: 262, at: 0.15, duration: 0.26, type: 'triangle', gain: 0.13 },
  ],
  warning: [
    { freq: 587, at: 0, duration: 0.1, gain: 0.1 },
    { freq: 587, at: 0.16, duration: 0.12, gain: 0.1 },
  ],
  // A soft two-note bell for ordinary notifications.
  notify: [
    { freq: 880, at: 0, duration: 0.5, gain: 0.1 },
    { freq: 1320, at: 0, duration: 0.35, gain: 0.03 },
    { freq: 1175, at: 0.14, duration: 0.6, gain: 0.09 },
  ],
  // Urgent ring (emergency call, surgery finished, bumped booking): the double
  // beep of a heart monitor, three times.
  urgent: [0, 0.62, 1.24].flatMap((start) => [
    { freq: 1046, at: start, duration: 0.11, gain: 0.16 },
    { freq: 1046, at: start + 0.17, duration: 0.11, gain: 0.16 },
    { freq: 523, at: start, duration: 0.3, type: 'triangle' as const, gain: 0.05 },
  ]),
};

let context: AudioContext | null = null;

function getContext() {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  context ??= new AudioContext();
  return context;
}

// Resume audio on the first interaction so later sounds (including ones not
// triggered by a click, like an incoming alert) can play.
if (typeof window !== 'undefined') {
  const unlock = () => {
    void getContext()?.resume();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function scheduleTone(ctx: AudioContext, output: AudioNode, tone: Tone, start: number) {
  const { freq, at, duration, type = 'sine', gain = 0.1, glideTo } = tone;
  const begin = start + at;
  const end = begin + duration;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, begin);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, end);

  // Quick fade in, exponential fade out: no clicks, a soft "monitor" decay.
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, begin);
  envelope.gain.exponentialRampToValueAtTime(gain, begin + Math.min(0.012, duration / 4));
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(envelope).connect(output);
  osc.start(begin);
  osc.stop(end + 0.02);
}

/** Plays a named sound if the user's sound settings allow it. Returns whether it played. */
export function playSound(name: SoundName) {
  const { enabled, uiSounds, volume } = useSoundStore.getState();
  if (!enabled || (UI_SOUNDS.has(name) && !uiSounds)) return false;

  const ctx = getContext();
  if (!ctx || ctx.state === 'closed') return false;
  if (ctx.state === 'suspended') void ctx.resume();

  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);

  const now = ctx.currentTime + 0.005;
  for (const tone of SOUNDS[name]) scheduleTone(ctx, master, tone, now);
  return true;
}
