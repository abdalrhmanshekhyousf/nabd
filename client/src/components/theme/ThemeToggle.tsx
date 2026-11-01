import { motion } from 'framer-motion';
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

export function ThemeToggle() {
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
