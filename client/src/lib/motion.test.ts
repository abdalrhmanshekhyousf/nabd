import { afterEach, describe, expect, it, vi } from 'vitest';
import { withViewTransition } from './motion';

const root = document.documentElement;

// jsdom has no View Transitions; install a minimal fake that runs the update.
function mockViewTransitions() {
  const start = vi.fn((update: () => void) => {
    update();
    return { finished: Promise.resolve() };
  });
  Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
  return start;
}

describe('withViewTransition', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition');
    root.removeAttribute('style');
    vi.restoreAllMocks();
  });

  it('just runs the update when the browser has no View Transitions', () => {
    const update = vi.fn();
    withViewTransition('theme', update);

    expect(update).toHaveBeenCalledOnce();
    expect(root.dataset.vt).toBeUndefined();
  });

  it('animates through a View Transition and starts the reveal at the origin', async () => {
    const start = mockViewTransitions();
    const update = vi.fn(() => expect(root.dataset.vt).toBe('theme'));

    withViewTransition('theme', update, { x: 100, y: 20 });

    expect(start).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(root.style.getPropertyValue('--vt-x')).toBe('100px');
    expect(root.style.getPropertyValue('--vt-y')).toBe('20px');
    // The marker is removed once the transition finishes.
    await Promise.resolve();
    await Promise.resolve();
    expect(root.dataset.vt).toBeUndefined();
  });

  it('skips the animation when the user prefers reduced motion', () => {
    const start = mockViewTransitions();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: query.includes('reduce') }) as MediaQueryList,
    );
    const update = vi.fn();

    withViewTransition('language', update);

    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
});
