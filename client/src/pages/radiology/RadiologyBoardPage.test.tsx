import type { ImagingBoardItem } from '@nabd/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { fakeApi } from '@/test/fakeApi';
import { renderApp } from '@/test/renderApp';

const fake = fakeApi(api);

const RADIOLOGIST: SessionUser = {
  id: 'r1',
  email: 'karim@amal.org',
  fullName: 'كريم',
  role: 'RADIOLOGIST',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

function study(id: string, bodyPart: string, more: Partial<ImagingBoardItem> = {}) {
  return {
    id,
    modality: 'CT',
    bodyPart,
    reason: null,
    priority: 'ROUTINE',
    status: 'REQUESTED',
    doctorName: 'د. سامي',
    radiologistName: null,
    report: null,
    imageCount: 0,
    abnormal: null,
    createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    startedAt: null,
    completedAt: null,
    patient: {
      id: 'p1',
      fullName: 'سارة',
      isAnonymous: false,
      gender: 'FEMALE',
      dateOfBirth: null,
    },
    mine: false,
    ...more,
  } satisfies ImagingBoardItem;
}

let studies: ImagingBoardItem[];
let noType: boolean;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  // jsdom has no object URLs for previews.
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  queryClient.clear();
  fake.calls.length = 0;
  noType = false;
  // As the server sends them: urgent first.
  studies = [
    study('s2', 'رأس', { priority: 'URGENT', reason: 'صداع بعد سقوط' }),
    study('s1', 'صدر'),
  ];
  useSessionStore.setState({ status: 'authenticated', user: RADIOLOGIST });
  fake.respond((config) => {
    if (config.url === '/imaging') {
      return noType
        ? { status: 403, data: { error: { code: 'FORBIDDEN', message: 'no' } } }
        : { status: 200, data: { modality: 'CT', studies } };
    }
    const report = config.url?.match(/^\/imaging\/(.+)\/report$/);
    if (report) {
      const done = {
        ...studies.find((s) => s.id === report[1])!,
        status: 'DONE' as const,
        imageCount: 2,
      };
      studies = studies.map((s) => (s.id === done.id ? done : s));
      return { status: 200, data: { study: done } };
    }
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('RadiologyBoardPage', () => {
  it('shows the requests of my type, urgent first, with the clinical question', async () => {
    renderApp('/radiology/requests');
    expect(await screen.findByText(/طلبات طبقي محوري اللي طلبها الأطباء/)).toBeInTheDocument();
    const waiting = screen.getByRole('region', { name: 'بانتظار' });
    expect(within(waiting).getAllByRole('listitem')[0]).toHaveTextContent('رأس');
    expect(within(waiting).getAllByRole('listitem')[0]).toHaveTextContent('مستعجل');
    expect(within(waiting).getAllByRole('listitem')[0]).toHaveTextContent('صداع بعد سقوط');
  });

  it('sends images and the report as a form; a report needs an image', async () => {
    renderApp('/radiology/requests');
    const user = userEvent.setup();
    const card = await screen.findByLabelText('طبقي محوري · رأس');
    await user.click(within(card).getByRole('button', { name: 'إرسال الصور والتقرير' }));
    const dialog = await screen.findByRole('dialog', { name: 'طبقي محوري · رأس: الصور والتقرير' });
    expect(dialog).toHaveTextContent('السؤال السريري: صداع بعد سقوط');

    await user.click(within(dialog).getByRole('button', { name: 'إرسال الصور والتقرير' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('ضيف صورة وحدة على الأقل');

    const picker = within(dialog).getByLabelText('الصور (لحد 10، JPG أو PNG أو PDF)', {
      selector: 'input',
    });
    await user.upload(picker, [
      new File(['a'], 'axial.png', { type: 'image/png' }),
      new File(['b'], 'report.pdf', { type: 'application/pdf' }),
    ]);
    expect(within(dialog).getByAltText('axial.png')).toBeInTheDocument();
    expect(within(dialog).getByText('report.pdf')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'شيل الصورة report.pdf' }));
    expect(within(dialog).queryByText('report.pdf')).toBeNull();

    await user.type(within(dialog).getByLabelText(/التقرير/), 'لا يوجد نزف داخل القحف');
    await user.click(within(dialog).getByRole('radio', { name: 'غير طبيعية' }));
    await user.click(within(dialog).getByRole('button', { name: 'إرسال الصور والتقرير' }));

    expect(
      await screen.findByText('انبعتت صور طبقي محوري · رأس وتقريرها لملف سارة، ووصل للطبيب إشعار'),
    ).toBeInTheDocument();
    const form = fake.calls.find((c) => c.url === '/imaging/s2/report')!.data as FormData;
    expect(form.get('report')).toBe('لا يوجد نزف داخل القحف');
    expect(form.get('abnormal')).toBe('true');
    expect((form.getAll('images') as File[]).map((f) => f.name)).toEqual(['axial.png']);
    expect(await screen.findByRole('region', { name: 'جاهزة اليوم' })).toHaveTextContent('صورتين');
  });

  it('a radiologist without a type is told to ask the admin', async () => {
    noType = true;
    renderApp('/radiology/requests');
    expect(await screen.findByText('لسا ما انحدّد نوع الأشعة تبعك')).toBeInTheDocument();
  });
});
