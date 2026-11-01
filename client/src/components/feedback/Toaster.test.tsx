import { act, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { describe, expect, it } from 'vitest';
import { setLanguage } from '@/i18n';
import { Toaster } from './Toaster';

const toaster = () => document.querySelector<HTMLElement>('[data-sonner-toaster]');

describe('Toaster', () => {
  it('shows a toast message', async () => {
    render(<Toaster />);

    act(() => {
      toast.success('انحفظت بيانات المريض');
    });

    expect(await screen.findByText('انحفظت بيانات المريض')).toBeInTheDocument();
  });

  it('sits on the left and reads right-to-left in Arabic', async () => {
    render(<Toaster />);
    act(() => {
      toast('مرحبا');
    });
    await screen.findByText('مرحبا');

    expect(toaster()).toHaveAttribute('dir', 'rtl');
    expect(toaster()).toHaveAttribute('data-x-position', 'left');
    expect(toaster()).toHaveAttribute('data-y-position', 'bottom');
  });

  it('flips to the right and left-to-right in English', async () => {
    render(<Toaster />);
    await act(async () => {
      await setLanguage('en');
    });
    act(() => {
      toast('Hello');
    });
    await screen.findByText('Hello');

    expect(toaster()).toHaveAttribute('dir', 'ltr');
    expect(toaster()).toHaveAttribute('data-x-position', 'right');
  });

  it('names the toast region in the current language', () => {
    render(<Toaster />);
    expect(screen.getByRole('region', { name: /الإشعارات المنبثقة/ })).toBeInTheDocument();
  });
});
