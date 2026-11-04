import type { DoctorCallItem } from '@nabd/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { fakeApi } from '@/test/fakeApi';
import { fakeSockets, lastSocket } from '@/test/fakeSocket';
import { renderApp } from '@/test/renderApp';

const fake = fakeApi(api);

const DOCTOR: SessionUser = {
  id: 'd1',
  email: 'sami@amal.org',
  fullName: 'د. سامي',
  role: 'DOCTOR',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

function call(
  id: string,
  fullName: string | null,
  overrides: Partial<DoctorCallItem> = {},
): DoctorCallItem {
  return {
    id,
    status: 'PENDING',
    createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    respondedAt: null,
    declineReason: null,
    calledBy: 'لينا',
    visit: {
      id: `v-${id}`,
      status: 'WAITING',
      level: 2,
      chiefComplaint: 'ألم بالصدر',
      arrivedAt: new Date().toISOString(),
      patient: {
        id: `p-${id}`,
        fullName,
        isAnonymous: fullName === null,
        gender: null,
        dateOfBirth: null,
      },
    },
    ...overrides,
  };
}

let calls: { pending: DoctorCallItem[]; answered: DoctorCallItem[] };

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
  calls = { pending: [call('c1', 'سارة')], answered: [] };
  useSessionStore.setState({ status: 'authenticated', user: DOCTOR });
  fake.respond((config) => {
    if (config.url === '/doctors/me/calls') return { status: 200, data: calls };
    const answer = config.url?.match(/^\/doctors\/me\/calls\/(.+)\/(accept|decline)$/);
    if (answer) {
      const [, id, kind] = answer;
      const found = calls.pending.find((c) => c.id === id)!;
      const done = {
        ...found,
        status: kind === 'accept' ? ('ACCEPTED' as const) : ('DECLINED' as const),
        respondedAt: new Date().toISOString(),
        declineReason: kind === 'decline' ? JSON.parse(config.data as string).reason : null,
      };
      calls = {
        pending: calls.pending.filter((c) => c.id !== id),
        answered: [done, ...calls.answered],
      };
      return { status: 200, data: { call: done } };
    }
    if (config.url === '/doctors/me/status') return { status: 200, data: { status: 'AVAILABLE' } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

const pendingRegion = () => screen.findByRole('region', { name: 'بانتظار ردّك' });

describe('DoctorCallsPage', () => {
  it('shows who is waiting and accepting moves the call to answered with the file link', async () => {
    renderApp('/doctor/calls');
    const user = userEvent.setup();
    const pending = await pendingRegion();
    expect(pending).toHaveTextContent('سارة');
    expect(pending).toHaveTextContent('ألم بالصدر');
    expect(pending).toHaveTextContent(/استدعاك لينا/);
    expect(within(pending).getByLabelText('المستوى 2')).toBeInTheDocument();

    await user.click(within(pending).getByRole('button', { name: 'قبول' }));

    expect(await screen.findByText('قبلت الاستدعاء، سارة صار من مرضاك')).toBeInTheDocument();
    expect(fake.calls.some((c) => c.url === '/doctors/me/calls/c1/accept')).toBe(true);
    const answered = await screen.findByRole('region', { name: 'رديت عليهن' });
    expect(answered).toHaveTextContent('قبلت');
    expect(within(answered).getByRole('link', { name: 'ملف المريض' })).toHaveAttribute(
      'href',
      '/doctor/patients/p-c1',
    );
    expect(await screen.findByText('ما في استدعاءات هلق')).toBeInTheDocument();
  });

  it('declining asks for a reason, offering quick ones', async () => {
    renderApp('/doctor/calls');
    const user = userEvent.setup();
    await user.click(within(await pendingRegion()).getByRole('button', { name: 'اعتذار' }));
    const dialog = await screen.findByRole('dialog', { name: 'اعتذار عن الاستدعاء' });

    await user.click(within(dialog).getByRole('button', { name: 'إرسال الاعتذار' }));
    expect(await within(dialog).findByText('هالحقل مطلوب')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'بعملية هلق' }));
    await user.click(within(dialog).getByRole('button', { name: 'إرسال الاعتذار' }));

    expect(await screen.findByText('اعتذرت عن الاستدعاء')).toBeInTheDocument();
    const post = fake.calls.find((c) => c.url?.endsWith('/decline'))!;
    expect(JSON.parse(post.data as string)).toEqual({ reason: 'بعملية هلق' });
    expect(await screen.findByRole('region', { name: 'رديت عليهن' })).toHaveTextContent('اعتذرت');
  });

  it('a new call appears live', async () => {
    calls = { pending: [], answered: [] };
    renderApp('/doctor/calls');
    expect(await screen.findByText('ما في استدعاءات هلق')).toBeInTheDocument();
    await waitFor(() => expect(fakeSockets).toHaveLength(1));

    calls = {
      pending: [call('c2', null, { visit: { ...call('c2', null).visit, level: null } })],
      answered: [],
    };
    act(() => lastSocket().fromServer('refresh', { queryKeys: [['doctor-calls']] }));

    const pending = await pendingRegion();
    expect(await within(pending).findByText('مريض مجهول الهوية')).toBeInTheDocument();
    expect(within(pending).getByLabelText('لسا ما انقيّم')).toBeInTheDocument();
  });
});
