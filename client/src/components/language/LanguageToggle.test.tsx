import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LanguageToggle } from './LanguageToggle';

function renderPage() {
  return render(
    <MemoryRouter>
      <LanguageToggle />
      <NotFoundPage />
    </MemoryRouter>,
  );
}

describe('LanguageToggle', () => {
  it('switches the page between Arabic and English', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText('الصفحة غير موجودة')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'تغيير اللغة إلى الإنكليزية' }));
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('ltr');

    await user.click(screen.getByRole('button', { name: 'Switch language to Arabic' }));
    expect(screen.getByText('الصفحة غير موجودة')).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('labels the target language in its own script', () => {
    renderPage();

    const label = screen.getByText('English');
    expect(label).toHaveAttribute('lang', 'en');
  });
});
