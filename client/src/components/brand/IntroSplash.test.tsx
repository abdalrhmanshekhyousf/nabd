import { act, fireEvent, render, screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { RootLayout } from '@/layouts/RootLayout';
import { INTRO_DURATION_MS } from './IntroSplash';

function renderApp() {
  const router = createMemoryRouter([
    { path: '/', element: <RootLayout />, children: [{ index: true, element: <p>app</p> }] },
  ]);
  return render(<RouterProvider router={router} />);
}

const splash = () => screen.queryByTestId('intro-splash');

// Let exit animations (skipped in tests) and React updates settle.
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
}

describe('intro splash', () => {
  beforeAll(() => {
    MotionGlobalConfig.skipAnimations = true;
  });
  afterAll(() => {
    MotionGlobalConfig.skipAnimations = false;
  });
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays on the first open, over the already-rendered app', () => {
    renderApp();

    expect(splash()).toBeInTheDocument();
    expect(screen.getByText('app')).toBeInTheDocument();
  });

  it('leaves by itself and is remembered for the session', async () => {
    renderApp();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTRO_DURATION_MS);
    });
    await flush();

    expect(splash()).not.toBeInTheDocument();
    expect(sessionStorage.getItem(INTRO_SEEN_KEY)).toBe('1');
  });

  it('skips on click', async () => {
    renderApp();

    fireEvent.click(splash()!);
    await flush();

    expect(splash()).not.toBeInTheDocument();
  });

  it('skips on any key', async () => {
    renderApp();

    fireEvent.keyDown(window, { key: 'Escape' });
    await flush();

    expect(splash()).not.toBeInTheDocument();
  });

  it('does not play again in the same session', () => {
    sessionStorage.setItem(INTRO_SEEN_KEY, '1');
    renderApp();

    expect(splash()).not.toBeInTheDocument();
  });

  it('shows the name in both scripts, with the Latin name left-to-right', () => {
    renderApp();

    expect(screen.getByText('نبض')).toBeInTheDocument();
    const latin = document.querySelector('[data-testid=intro-splash] p[lang=en]');
    expect(latin).toHaveAttribute('dir', 'ltr');
    expect(latin?.textContent).toBe('Nabd');
  });
});
