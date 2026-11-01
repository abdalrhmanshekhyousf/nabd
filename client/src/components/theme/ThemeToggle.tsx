import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemeStore, type ThemeChoice } from '@/stores/themeStore';

// Placeholder labels until i18next is set up in task 1.11.
const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'فاتح', Icon: Sun },
  { value: 'dark', label: 'داكن', Icon: Moon },
  { value: 'system', label: 'حسب الجهاز', Icon: Monitor },
];

export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return (
    <div
      role="group"
      aria-label="وضع العرض"
      className="inline-flex rounded-full border border-border bg-surface p-1"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`inline-flex size-9 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted hover:bg-surface-muted hover:text-foreground'
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
