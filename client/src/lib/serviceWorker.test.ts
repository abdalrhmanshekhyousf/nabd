import { describe, expect, it, vi } from 'vitest';
import { installOffer } from './serviceWorker';

describe('install offer (task 3.25)', () => {
  it('keeps the browser’s offer for our button, prompts once, then forgets it', async () => {
    expect(installOffer.available()).toBe(false);
    const seen = vi.fn();
    const stop = installOffer.subscribe(seen);

    const prompt = vi.fn(async () => {});
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(installOffer.available()).toBe(true);
    expect(seen).toHaveBeenCalled();

    await expect(installOffer.install()).resolves.toBe(true);
    expect(prompt).toHaveBeenCalledOnce();
    expect(installOffer.available()).toBe(false);
    await expect(installOffer.install()).resolves.toBe(false);
    stop();
  });
});
