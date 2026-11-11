import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// A page made only for printing (tasks 3.11, 3.24): while mounted, it alone is
// printed (body.printing hides the app, in light colours whatever the theme);
// it opens the browser's print dialog — where "Save as PDF" is — and calls
// onDone when that closes.
export function PrintSheet({
  children,
  onDone,
  testId,
}: {
  children: ReactNode;
  onDone: () => void;
  testId?: string;
}) {
  useEffect(() => {
    document.body.classList.add('printing');
    window.addEventListener('afterprint', onDone);
    // Two frames: the sheet and its images are laid out before printing.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => window.print());
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      window.removeEventListener('afterprint', onDone);
      document.body.classList.remove('printing');
    };
  }, [onDone]);

  return createPortal(
    <div className="print-sheet bg-white p-6 text-foreground" data-testid={testId}>
      {children}
    </div>,
    document.body,
  );
}
