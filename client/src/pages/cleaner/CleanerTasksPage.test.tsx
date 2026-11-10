import type { CleaningRequestView } from '@nabd/shared';
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

const CLEANER: SessionUser = {
  id: 'c1',
  email: 'abu@amal.org',
  fullName: 'أبو محمد',
  role: 'CLEANER',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function job(id: string, overrides: Partial<CleaningRequestView> = {}): CleaningRequestView {
  return {
    id,
    kind: 'CLEANING',
    status: 'PENDING',
    department: { id: 'er', name: 'الإسعاف', code: 'EMERGENCY' },
    place: 'ممر الإسعاف',
    operatingRoom: null,
    bed: null,
    note: null,
    requestedBy: 'لينا',
    assignedTo: null,
    mine: false,
    createdAt: ago(12),
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

const STERILIZE = job('s1', {
  kind: 'STERILIZATION',
  department: { id: 'or', name: 'العمليات', code: 'OPERATIONS' },
  place: 'غرفة 1',
  operatingRoom: { id: 'r1', name: 'غرفة 1' },
  requestedBy: 'رامي',
  createdAt: ago(5),
});
let jobs: CleaningRequestView[];

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
  jobs = [
    STERILIZE,
    job('j1'),
    job('j2', {
      place: 'غرفة 4',
      status: 'IN_PROGRESS',
      assignedTo: { id: 'c2', fullName: 'أم علي' },
      startedAt: ago(3),
    }),
  ];
  useSessionStore.setState({ status: 'authenticated', user: CLEANER });
  fake.respond((config) => {
    if (config.url === '/cleaning-requests') return { status: 200, data: { requests: jobs } };
    const move = config.url?.match(/^\/cleaning-requests\/(.+)\/(start|finish)$/);
    if (move) {
      const [, id, step] = move;
      if (id === 'j1' && step === 'start') {
        return {
          status: 409,
          data: { error: { code: 'ALREADY_TAKEN', message: 'حدا تاني أخد هالطلب قبلك' } },
        };
      }
      const updated: CleaningRequestView = {
        ...jobs.find((j) => j.id === id)!,
        ...(step === 'start'
          ? {
              status: 'IN_PROGRESS',
              mine: true,
              startedAt: ago(0),
              assignedTo: { id: 'c1', fullName: 'أبو محمد' },
            }
          : { status: 'DONE', finishedAt: ago(0) }),
      };
      jobs = jobs.map((j) => (j.id === id ? updated : j));
      return { status: 200, data: { request: updated } };
    }
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

const section = (name: string) => screen.findByRole('region', { name });

describe('CleanerTasksPage', () => {
  it('groups the jobs: sterilization first among waiting, and who is on the others', async () => {
    renderApp('/cleaning/tasks');
    const waiting = await section('بالانتظار');
    const cards = within(waiting).getAllByRole('listitem');
    expect(cards[0]).toHaveTextContent('غرفة 1');
    expect(cards[0]).toHaveTextContent('تعقيم');
    expect(cards[0]).toHaveTextContent('العمليات');
    expect(cards[0]).toHaveTextContent('من رامي');
    expect(cards[0]).toHaveTextContent('ناطر من 0:05');
    expect(cards[1]).toHaveTextContent('ممر الإسعاف');
    const others = screen.getByRole('region', { name: 'عم يشتغل عليها غيري' });
    expect(others).toHaveTextContent('عم يشتغل عليها أم علي');
    expect(within(others).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('region', { name: 'شغلي هلق' })).toBeNull();
  });

  it('started moves the job to my work with a timer, finished to done today', async () => {
    renderApp('/cleaning/tasks');
    const user = userEvent.setup();
    const waiting = await section('بالانتظار');
    await user.click(
      within(within(waiting).getByLabelText('غرفة 1')).getByRole('button', { name: 'بلّشت' }),
    );

    expect(await screen.findByText('بلّشت بـ غرفة 1')).toBeInTheDocument();
    const mine = await section('شغلي هلق');
    expect(mine).toHaveTextContent('صرلك 0:00');
    await user.click(within(mine).getByRole('button', { name: 'خلصت' }));

    expect(await screen.findByText('خلصت غرفة 1، يعطيك العافية')).toBeInTheDocument();
    expect(await section('خلصتها اليوم')).toHaveTextContent('غرفة 1');
    expect(fake.calls.map((c) => c.url).filter((u) => u?.includes('/s1/'))).toEqual([
      '/cleaning-requests/s1/start',
      '/cleaning-requests/s1/finish',
    ]);
  });

  it('tells me when someone took the job first', async () => {
    renderApp('/cleaning/tasks');
    const user = userEvent.setup();
    const waiting = await section('بالانتظار');
    await user.click(
      within(within(waiting).getByLabelText('ممر الإسعاف')).getByRole('button', { name: 'بلّشت' }),
    );
    expect(await screen.findByText('حدا تاني أخد هالطلب قبلك')).toBeInTheDocument();
  });

  it('is all clear when nothing waits, and a new job appears live', async () => {
    jobs = [];
    renderApp('/cleaning/tasks');
    expect(await screen.findByText('ما في طلبات هلق')).toBeInTheDocument();
    await waitFor(() => expect(fakeSockets).toHaveLength(1));

    jobs = [STERILIZE];
    act(() => lastSocket().fromServer('refresh', { queryKeys: [['cleaning-requests']] }));
    expect(await section('بالانتظار')).toHaveTextContent('غرفة 1');
    expect(screen.queryByText('ما في طلبات هلق')).toBeNull();
  });

  it('a bed a patient left shows its room and bed, and why (task 3.17)', async () => {
    jobs = [
      job('bed1', {
        place: null,
        bed: { id: 'b2', label: '2', room: '101' },
        note: 'DISCHARGED',
        department: { id: 'in', name: 'Internal', code: 'INTERNAL_MEDICINE' },
      }),
    ];
    renderApp('/cleaning/tasks');
    const card = await screen.findByLabelText('غرفة 101 · سرير 2');
    expect(card).toHaveTextContent('طلع المريض');
    await userEvent.setup().click(within(card).getByRole('button', { name: 'بلّشت' }));
    expect(await screen.findByText('بلّشت بـ غرفة 101 · سرير 2')).toBeInTheDocument();
  });
});
