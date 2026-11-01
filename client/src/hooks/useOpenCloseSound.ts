import { useEffect, useRef } from 'react';
import { playSound } from '@/lib/sound';

// Soft "open" and "close" sounds for modals, drawers and menus. Nothing plays
// on first render, only when `open` actually changes.
export function useOpenCloseSound(open: boolean) {
  const previous = useRef(open);

  useEffect(() => {
    if (previous.current === open) return;
    previous.current = open;
    playSound(open ? 'open' : 'close');
  }, [open]);
}
