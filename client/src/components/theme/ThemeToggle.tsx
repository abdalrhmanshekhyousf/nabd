import { AnimatePresence, motion } from 'framer-motion';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useId, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { calmSpring, withViewTransition } from '@/lib/motion';
import { applyTheme } from '@/lib/theme';
import { useThemeStore, type ThemeChoice } from '@/stores/themeStore';

const OPTIONS: { value: ThemeChoice; Icon: typeof Sun }[] = [
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: Moon },
  { value: 'system', Icon: Monitor },
];

type ThemeToggleProps = {
  /** One button that cycles light, dark, system (for tight spaces like phone top bars). */
  compact?: boolean;
};

const NEXT: Record<ThemeChoice, ThemeChoice> = { light: 'dark', dark: 'system', system: 'light' };

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { t } = useTranslation();
  const pillId = useId();
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  const choose = (value: ThemeChoice, event: MouseEvent<HTMLButtonElement>) => {
    if (value === theme) return;
    const box = event.currentTarget.getBoundingClientRect();
    // The new colors spread out in a circle from this button.
    withViewTransition(
      'theme',
      () => {
        setTheme(value);
        applyTheme(value);
      },
      { x: box.left + box.width / 2, y: box.top + box.height / 2 },
    );
  };

  if (compact) {
    const current = OPTIONS.find((option) => option.value === theme) ?? OPTIONS[2];
    const label = t('theme.current', { mode: t(`theme.${theme}`) });
    return (
      <motion.button
        type="button"
        aria-label={label}
        title={label}
        onClick={(event) => choose(NEXT[theme], event)}
        whileTap={{ scale: 0.92 }}
        className="relative inline-flex size-9 items-center justify-center overflow-hidden rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={theme}
            initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
            transition={calmSpring}
          >
            <current.Icon className="size-[18px]" aria-hidden="true" />
          </motion.span>
        </AnimatePresence>
      </motion.button>
    );
  }

  return (
    <div
      role="group"
      aria-label={t('theme.label')}
      className="inline-flex rounded-full bg-surface-muted p-1"
    >
      {OPTIONS.map(({ value, Icon }) => {
        const active = theme === value;
        const label = t(`theme.${value}`);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={(event) => choose(value, event)}
            className={cn(
              'relative inline-flex size-9 items-center justify-center rounded-full transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              active ? 'text-accent' : 'text-muted hover:text-foreground',
            )}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                className="absolute inset-0 rounded-full bg-surface shadow-soft"
                transition={calmSpring}
              />
            )}
            <motion.span
              className="relative"
              animate={{ rotate: active ? 0 : -30, scale: active ? 1 : 0.9 }}
              transition={calmSpring}
            >
              <Icon className="size-4" aria-hidden="true" />
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}
