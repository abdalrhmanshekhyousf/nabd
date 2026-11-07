import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { fakeApi } from '@/test/fakeApi';
import { ImagingViewer } from './ImagingViewer';
import '@/i18n';

const fake = fakeApi(api);

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:image-${(n += 1)}`);
  URL.revokeObjectURL = vi.fn();
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  fake.calls.length = 0;
  vi.mocked(URL.revokeObjectURL).mockClear();
  fake.respond((config) => {
    const match = config.url?.match(/^\/imaging\/s1\/images\/(\d)$/);
    if (match) {
      const type = match[1] === '2' ? 'application/pdf' : 'image/png';
      return { status: 200, data: new Blob(['x'], { type }) };
    }
    if (config.url === '/imaging/s9/images/0') {
      return { status: 404, data: { error: { code: 'NOT_FOUND', message: 'المطلوب غير موجود' } } };
    }
    return { status: 200, data: {} };
  });
});

const open = (onClose = vi.fn(), studyId = 's1', count = 3) =>
  render(
    <ImagingViewer studyId={studyId} count={count} title="طبقي محوري · رأس" onClose={onClose} />,
  );

describe('ImagingViewer', () => {
  it('fetches each image with the session, shows one at a time and moves between them', async () => {
    open();
    const user = userEvent.setup();
    const viewer = screen.getByRole('dialog', { name: 'طبقي محوري · رأس' });
    expect(await within(viewer).findByAltText('الصورة 1 من طبقي محوري · رأس')).toBeInTheDocument();
    expect(viewer).toHaveTextContent('1 / 3');
    expect(fake.calls.map((c) => [c.url, c.responseType])).toEqual(
      expect.arrayContaining([['/imaging/s1/images/0', 'blob']]),
    );

    await user.click(within(viewer).getByRole('button', { name: 'الصورة التالية' }));
    expect(viewer).toHaveTextContent('2 / 3');
    expect(within(viewer).getByRole('button', { name: 'الصورة السابقة' })).toBeEnabled();
    // A PDF opens in a tab rather than in the viewer.
    await user.click(within(viewer).getByRole('button', { name: 'الصورة 3 من طبقي محوري · رأس' }));
    expect(await within(viewer).findByRole('button', { name: 'فتح الملف' })).toBeInTheDocument();
    expect(within(viewer).getByRole('button', { name: 'الصورة التالية' })).toBeDisabled();
  });

  it('zooms in steps, back to actual size, and resets when moving on', async () => {
    open();
    const user = userEvent.setup();
    const viewer = screen.getByRole('dialog');
    await within(viewer).findByAltText('الصورة 1 من طبقي محوري · رأس');
    expect(within(viewer).getByRole('button', { name: 'تصغير' })).toBeDisabled();

    await user.click(within(viewer).getByRole('button', { name: 'تكبير' }));
    await user.click(within(viewer).getByRole('button', { name: 'تكبير' }));
    expect(viewer).toHaveTextContent('200%');
    await user.keyboard('-');
    expect(viewer).toHaveTextContent('150%');
    await user.click(within(viewer).getByRole('button', { name: 'الحجم الأصلي' }));
    expect(viewer).toHaveTextContent('100%');
    await user.keyboard('+');
    // In Arabic the next image is to the left.
    await user.keyboard('{ArrowLeft}');
    expect(viewer).toHaveTextContent('2 / 3');
    expect(viewer).toHaveTextContent('100%');
  });

  it('closes with Escape and frees the images it held', async () => {
    const onClose = vi.fn();
    const { unmount } = open(onClose);
    await screen.findByAltText('الصورة 1 من طبقي محوري · رأس');
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(3));
    await userEvent.setup().keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
  });

  it('says so when the image is not theirs to see', async () => {
    open(vi.fn(), 's9', 1);
    expect(await screen.findByRole('alert')).toHaveTextContent('المطلوب غير موجود');
  });
});
