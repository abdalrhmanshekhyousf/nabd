import type { ErVisit } from '@nabd/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { apiError, fakeApi } from '@/test/fakeApi';
import { fakeSockets, lastSocket } from '@/test/fakeSocket';
import { renderApp } from '@/test/renderApp';

const fake = fakeApi(api);

const NURSE: SessionUser = {
  id: 'n1',
  email: 'lina@amal.org',
  fullName: 'لينا',
  role: 'NURSE',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function visit(id: string, fullName: string | null, overrides: Partial<ErVisit>): ErVisit {
  return {
    id,
    status: 'WAITING',
    arrivedAt: minutesAgo(1),
    assessedAt: null,
    chiefComplaint: 'شكوى',
    arrivalNote: null,
    patient: {
      id: `p-${id}`,
      fullName,
      isAnonymous: fullName === null,
      gender: null,
      dateOfBirth: null,
    },
    breathing: null,
    consciousness: null,
    pulse: null,
    systolic: null,
    diastolic: null,
    respiratoryRate: null,
    oxygenSaturation: null,
    temperature: null,
    painScore: null,
    expectedExams: null,
    suggestedLevel: null,
    level: null,
    overrideReason: null,
    reasons: [],
    ...overrides,
  };
}

let queue: ErVisit[];
let forbidden = false;

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
  forbidden = false;
  queue = [
    visit('new', null, { chiefComplaint: 'غياب وعي' }),
    visit('chest', 'سامر', {
      level: 2,
      suggestedLevel: 2,
      arrivedAt: minutesAgo(25),
      pulse: 124,
      oxygenSaturation: 90,
    }),
    visit('belly', 'ليلى', {
      level: 3,
      suggestedLevel: 3,
      arrivedAt: minutesAgo(5),
      status: 'IN_TREATMENT',
    }),
    visit('cut', 'عمر', {
      level: 5,
      suggestedLevel: 4,
      overrideReason: 'جرح سطحي',
      arrivedAt: minutesAgo(3),
    }),
  ];
  useSessionStore.setState({ status: 'authenticated', user: NURSE });
  fake.respond((config) => {
    if (config.url === '/er/queue') {
      return forbidden
        ? apiError(403, 'FORBIDDEN', 'ممنوع')
        : { status: 200, data: { visits: queue } };
    }
    if (config.url === '/notifications') {
      return { status: 200, data: { notifications: [], unread: 0 } };
    }
    return { status: 200, data: {} };
  });
});

const names = (region: HTMLElement) =>
  within(region)
    .getAllByRole('link')
    .map((link) => link.getAttribute('aria-label'));

describe('ErQueuePage', () => {
  it('puts new arrivals first, then the rest by level, with the counts', async () => {
    renderApp('/nurse/emergency');

    const toTriage = await screen.findByRole('region', { name: 'بانتظار التقييم' });
    expect(names(toTriage)).toEqual(['فتح مريض مجهول الهوية']);
    expect(within(toTriage).getByText('قيّم الآن')).toBeInTheDocument();
    const byLevel = screen.getByRole('region', { name: 'حسب الخطورة' });
    expect(names(byLevel)).toEqual(['فتح سامر', 'فتح ليلى', 'فتح عمر']);
    expect(screen.getByText('بالإسعاف: 4')).toBeInTheDocument();
    expect(screen.getByLabelText('المستوى 2: 1')).toBeInTheDocument();
    expect(screen.getByLabelText('المستوى 1: 0')).toBeInTheDocument();
  });

  it('shows how long each has waited, who is late, abnormal signs and status', async () => {
    renderApp('/nurse/emergency');

    const chest = await screen.findByRole('link', { name: 'فتح سامر' });
    expect(chest).toHaveTextContent('بالانتظار 25 د · تأخّر');
    expect(chest).toHaveTextContent('نبض 124');
    expect(chest).toHaveTextContent('أكسجة 90%');
    expect(screen.getByRole('link', { name: 'فتح ليلى' })).toHaveTextContent('قيد العلاج');
    expect(screen.getByRole('link', { name: 'فتح ليلى' })).not.toHaveTextContent('تأخّر');
    expect(screen.getByRole('link', { name: 'فتح عمر' })).toHaveTextContent('معدّل يدوياً');
  });

  it('reorders live when the server says the list changed', async () => {
    renderApp('/nurse/emergency');
    const byLevel = await screen.findByRole('region', { name: 'حسب الخطورة' });
    await waitFor(() => expect(fakeSockets).toHaveLength(1));

    queue = [
      visit('cut', 'عمر', {
        level: 1,
        suggestedLevel: 4,
        overrideReason: 'نزيف',
        arrivedAt: minutesAgo(3),
      }),
      ...queue.filter((v) => v.id !== 'cut' && v.id !== 'new'),
    ];
    act(() => lastSocket().fromServer('refresh', { queryKeys: [['er-queue']] }));

    await waitFor(() => expect(names(byLevel)).toEqual(['فتح عمر', 'فتح سامر', 'فتح ليلى']));
    expect(screen.queryByRole('region', { name: 'بانتظار التقييم' })).toBeNull();
  });

  it('opens the triage of a card', async () => {
    const router = renderApp('/nurse/emergency');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('link', { name: 'فتح سامر' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/nurse/triage/chest'));
  });

  it('is calm when nobody is waiting', async () => {
    queue = [];
    renderApp('/nurse/emergency');
    expect(await screen.findByText('ما في مرضى بالإسعاف هلق')).toBeInTheDocument();
  });

  it('tells a nurse outside the emergency room', async () => {
    forbidden = true;
    renderApp('/nurse/emergency');
    expect(await screen.findByText('هالصفحة لممرضين الإسعاف')).toBeInTheDocument();
  });
});
