import type { WardBoard } from '@nabd/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { apiError, fakeApi } from '@/test/fakeApi';
import { renderApp } from '@/test/renderApp';

const fake = fakeApi(api);

const NURSE: SessionUser = {
  id: 'n1',
  email: 'reem@amal.org',
  fullName: 'ريم',
  role: 'NURSE',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const SARA = {
  patientId: 'p1',
  fullName: 'سارة الأحمد',
  isAnonymous: false,
  gender: 'FEMALE' as const,
  dateOfBirth: null,
};
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

function board(): WardBoard {
  return {
    department: { id: 'd1', name: 'Internal', code: 'INTERNAL_MEDICINE' },
    rooms: [
      {
        id: 'r1',
        number: '101',
        floor: 1,
        beds: [
          {
            id: 'b1',
            label: '1',
            status: 'OCCUPIED',
            statusChangedAt: hoursAgo(5),
            stay: {
              id: 's1',
              patient: SARA,
              notes: 'التهاب رئة',
              admittedAt: hoursAgo(5),
              admittedByName: 'لمى',
              fromEr: true,
            },
          },
          { id: 'b2', label: '2', status: 'EMPTY', statusChangedAt: hoursAgo(30), stay: null },
          { id: 'b3', label: '3', status: 'CLEANING', statusChangedAt: hoursAgo(1), stay: null },
        ],
      },
    ],
    incoming: [
      {
        visitId: 'v1',
        patient: { ...SARA, patientId: 'p2', fullName: 'عمر' },
        level: 2,
        chiefComplaint: 'ضيق نفس',
        closingNote: 'أكسجين',
        transferredAt: hoursAgo(1),
      },
    ],
  };
}

let current: WardBoard;
let noWard = false;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  queryClient.clear();
  fake.calls.length = 0;
  current = board();
  noWard = false;
  useSessionStore.setState({ status: 'authenticated', user: NURSE });
  fake.respond((config) => {
    if (config.url === '/ward/board') {
      return noWard ? apiError(403, 'FORBIDDEN') : { status: 200, data: current };
    }
    if (config.url === '/ward/patients') {
      return {
        status: 200,
        data: { patients: [{ ...SARA, patientId: 'p3', fullName: 'سامر', phone: null }] },
      };
    }
    if (config.url?.startsWith('/beds/')) return { status: 200, data: { history: [] } };
    if (config.method === 'post' && config.url?.startsWith('/ward/')) {
      return { status: 200, data: { ok: true, stayId: 's2' } };
    }
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

const body = (url: string) =>
  JSON.parse(fake.calls.find((c) => c.method === 'post' && c.url === url)!.data as string);

describe('WardPage (task 3.16)', () => {
  it('shows every bed with its patient, the counts, and who waits from the ER', async () => {
    renderApp('/nurse/beds');
    const room = await screen.findByRole('region', { name: 'غرفة 101' });
    expect(
      within(room).getByRole('button', { name: /سرير 1، مشغول سارة الأحمد/ }),
    ).toHaveTextContent('من 5 ساعات');
    expect(within(room).getByRole('button', { name: /سرير 2، فارغ/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'حالة الأسرّة' })).toHaveTextContent('مشغول · 1');
    const incoming = screen.getByRole('region', { name: 'جايين من الإسعاف' });
    expect(within(incoming).getByLabelText('عمر')).toHaveTextContent('ضيق نفس');
  });

  it('gives an ER patient a bed: pick them, then a free bed, then confirm', async () => {
    renderApp('/nurse/beds');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'اعطيه سرير' }));
    await user.click(screen.getByRole('button', { name: /سرير 2، فارغ/ }));
    const dialog = await screen.findByRole('dialog', { name: 'سرير 2 · غرفة 101' });
    expect(within(dialog).getByRole('radio', { name: /عمر/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.type(within(dialog).getByLabelText(/ملاحظات/), 'مراقبة');
    await user.click(within(dialog).getByRole('button', { name: 'قبول عمر بالسرير' }));
    expect(await screen.findByText('انقبل عمر')).toBeInTheDocument();
    expect(body('/ward/admissions')).toEqual({
      bedId: 'b2',
      visitId: 'v1',
      patientId: null,
      notes: 'مراقبة',
    });
  });

  it('admits a patient found by name', async () => {
    renderApp('/nurse/beds');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /سرير 2، فارغ/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'قبول بالسرير' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('اختار المريض أول');
    await user.type(within(dialog).getByLabelText('اسم المريض'), 'سام');
    await user.click(await within(dialog).findByRole('radio', { name: /سامر/ }));
    await user.click(within(dialog).getByRole('button', { name: 'قبول سامر بالسرير' }));
    expect(body('/ward/admissions')).toMatchObject({ patientId: 'p3', visitId: null });
  });

  it('moves and discharges the patient of a bed', async () => {
    renderApp('/nurse/beds');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /سارة الأحمد/ }));
    let dialog = await screen.findByRole('dialog', { name: 'سرير 1 · غرفة 101' });
    expect(dialog).toHaveTextContent('قبلته لمى');
    expect(dialog).toHaveTextContent('التهاب رئة');
    await user.click(within(dialog).getByRole('button', { name: 'نقل لسرير تاني' }));
    // Only free beds are offered.
    const choices = within(dialog).getAllByRole('radio');
    expect(choices.map((c) => c.textContent)).toEqual(['سرير 2 · 101']);
    await user.click(choices[0]!);
    await user.click(within(dialog).getByRole('button', { name: 'تأكيد النقل' }));
    expect(body('/ward/stays/s1/move')).toEqual({ bedId: 'b2' });

    await user.click(await screen.findByRole('button', { name: /سارة الأحمد/ }));
    dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'تخريج' }));
    await user.click(within(dialog).getByRole('button', { name: 'تخريج سارة الأحمد' }));
    expect(await screen.findByText('طلع سارة الأحمد، والسرير صار للتنظيف')).toBeInTheDocument();
  });

  it('reserves an empty bed and marks a cleaned one ready', async () => {
    renderApp('/nurse/beds');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /سرير 2، فارغ/ }));
    await user.click(await screen.findByRole('button', { name: 'احجزه لمريض جاي' }));
    expect(body('/ward/beds/b2/status')).toEqual({ to: 'RESERVED', reason: null });

    await user.click(await screen.findByRole('button', { name: /سرير 3، قيد التنظيف/ }));
    await user.click(await screen.findByRole('button', { name: 'صار نضيف وجاهز' }));
    expect(body('/ward/beds/b3/status')).toEqual({ to: 'EMPTY', reason: null });
  });

  it('a nurse without a ward is told so', async () => {
    noWard = true;
    renderApp('/nurse/beds');
    expect(await screen.findByText(/حسابك مو مربوط بقسم/)).toBeInTheDocument();
  });
});
