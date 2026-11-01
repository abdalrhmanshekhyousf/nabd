import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useApplyTheme } from '@/hooks/useApplyTheme';
import { THEME_STORAGE_KEY, useThemeStore } from '@/stores/themeStore';
import { setSystemDarkMode } from '@/test/matchMedia';
import { ThemeToggle } from './ThemeToggle';

function App() {
  useApplyTheme();
  return <ThemeToggle />;
}

const isDark = () => document.documentElement.classList.contains('dark');

describe('theme switching', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'system' });
  });

  it('starts on "system" and marks that option as selected', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'حسب الجهاز' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(isDark()).toBe(false);
  });

  it('switches to dark and back to light instantly, and remembers the choice', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'داكن' }));
    expect(isDark()).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('button', { name: 'داكن' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'فاتح' }));
    expect(isDark()).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('follows the device while on "system"', () => {
    render(<App />);

    act(() => setSystemDarkMode(true));
    expect(isDark()).toBe(true);

    act(() => setSystemDarkMode(false));
    expect(isDark()).toBe(false);
  });

  it('ignores device changes once the user picks a fixed theme', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'فاتح' }));
    act(() => setSystemDarkMode(true));

    expect(isDark()).toBe(false);
  });
});
