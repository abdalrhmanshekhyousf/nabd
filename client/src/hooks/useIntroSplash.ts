import { useCallback, useState } from 'react';

export const INTRO_SEEN_KEY = 'nabd-intro-seen';

function hasSeenIntro() {
  try {
    return sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

// The intro plays once per browser session (a new tab or window plays it again),
// so reloading or navigating while working never repeats it.
export function useIntroSplash() {
  const [visible, setVisible] = useState(() => !hasSeenIntro());

  const finish = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_SEEN_KEY, '1');
    } catch {
      // Storage blocked: the intro may show again next load, which is harmless.
    }
    setVisible(false);
  }, []);

  return { visible, finish };
}
