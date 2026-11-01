import { create } from 'zustand';

export const SOUND_STORAGE_KEY = 'nabd-sound';

type SoundSettings = {
  /** Master switch: off silences everything, alerts included. */
  enabled: boolean;
  /** Clicks and swooshes of the interface (buttons, menus, toggles). */
  uiSounds: boolean;
  /** 0..1 */
  volume: number;
};

const DEFAULTS: SoundSettings = { enabled: true, uiSounds: true, volume: 0.7 };

function readStored(): SoundSettings {
  try {
    const raw = localStorage.getItem(SOUND_STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
      uiSounds: typeof parsed.uiSounds === 'boolean' ? parsed.uiSounds : DEFAULTS.uiSounds,
      volume:
        typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 1
          ? parsed.volume
          : DEFAULTS.volume,
    };
  } catch {
    return DEFAULTS;
  }
}

type SoundState = SoundSettings & {
  update: (changes: Partial<SoundSettings>) => void;
};

// Kept on this device, like the theme until it moves to the user's account.
export const useSoundStore = create<SoundState>()((set, get) => ({
  ...readStored(),
  update: (changes) => {
    set(changes);
    const { enabled, uiSounds, volume } = get();
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify({ enabled, uiSounds, volume }));
    } catch {
      // Storage blocked: the setting still applies for this visit.
    }
  },
}));
