import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Switch } from '@/components/ui/Switch';
import { SOUND_STORAGE_KEY, useSoundStore } from '@/stores/soundStore';
import { notify } from './notify';
import { playSound } from './sound';

// Minimal fake of the Web Audio graph that records every oscillator started.
const started: { type: OscillatorType; freq: number }[] = [];
let masterVolume = 0;

class FakeParam {
  current = 0;
  /** Direct assignment is only used for the master volume. */
  set value(volume: number) {
    masterVolume = volume;
  }
  setValueAtTime(value: number) {
    this.current = value;
  }
  exponentialRampToValueAtTime() {}
}
class FakeNode {
  connect<T>(node: T) {
    return node;
  }
}
class FakeOscillator extends FakeNode {
  type: OscillatorType = 'sine';
  frequency = new FakeParam();
  start() {
    started.push({ type: this.type, freq: this.frequency.current });
  }
  stop() {}
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = new FakeNode();
  createOscillator() {
    return new FakeOscillator();
  }
  createGain() {
    return new FakeGain();
  }
  resume() {
    return Promise.resolve();
  }
}

beforeAll(() => {
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

beforeEach(() => {
  started.length = 0;
  masterVolume = 0;
  useSoundStore.setState({ enabled: true, uiSounds: true, volume: 0.7 });
});

describe('playSound', () => {
  it('plays a sound at the chosen volume', () => {
    expect(playSound('success')).toBe(true);
    expect(started).toHaveLength(2);
    expect(masterVolume).toBe(0.7);
  });

  it('rings the urgent alert as three double beeps', () => {
    playSound('urgent');
    const beeps = started.filter((tone) => tone.freq === 1046);
    expect(beeps).toHaveLength(6);
  });

  it('stays silent when sounds are off', () => {
    useSoundStore.setState({ enabled: false });

    expect(playSound('urgent')).toBe(false);
    expect(playSound('tap')).toBe(false);
    expect(started).toHaveLength(0);
  });

  it('turning off interface sounds keeps alerts and messages', () => {
    useSoundStore.setState({ uiSounds: false });

    expect(playSound('tap')).toBe(false);
    expect(playSound('open')).toBe(false);
    expect(playSound('notify')).toBe(true);
    expect(playSound('error')).toBe(true);
  });
});

describe('soundStore', () => {
  it('saves settings on the device', () => {
    useSoundStore.getState().update({ uiSounds: false });

    expect(JSON.parse(localStorage.getItem(SOUND_STORAGE_KEY)!)).toEqual({
      enabled: true,
      uiSounds: false,
      volume: 0.7,
    });
  });

  it('restores saved settings and ignores invalid ones', async () => {
    localStorage.setItem(
      SOUND_STORAGE_KEY,
      JSON.stringify({ enabled: false, uiSounds: 'yes', volume: 5 }),
    );
    vi.resetModules();
    const { useSoundStore: fresh } = await import('@/stores/soundStore');

    expect(fresh.getState()).toMatchObject({ enabled: false, uiSounds: true, volume: 0.7 });
  });
});

describe('notify', () => {
  it('shows the toast and plays the matching sound', () => {
    const spy = vi.spyOn(toast, 'success').mockReturnValue('id');

    notify.success('انحفظ');

    expect(spy).toHaveBeenCalledWith('انحفظ', undefined);
    expect(started).toHaveLength(2);
    spy.mockRestore();
  });

  it('rings for urgent alerts and keeps the toast up longer', () => {
    const spy = vi.spyOn(toast, 'error').mockReturnValue('id');

    notify.alert('استدعاء عاجل', { urgent: true });

    expect(spy).toHaveBeenCalledWith('استدعاء عاجل', { duration: 10000 });
    expect(started.filter((tone) => tone.freq === 1046)).toHaveLength(6);
    spy.mockRestore();
  });
});

describe('Switch', () => {
  it('is an accessible switch that flips its state', async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="أصوات الواجهة" />);

    const control = screen.getByRole('switch', { name: 'أصوات الواجهة' });
    expect(control).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
