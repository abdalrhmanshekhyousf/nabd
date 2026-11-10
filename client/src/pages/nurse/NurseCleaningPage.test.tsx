import type { CleaningRequestView } from '@nabd/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { fakeApi } from '@/test/fakeApi';
import { renderApp } from '@/test/renderApp';

const fake = fakeApi(api);

const NURSE: SessionUser = {
  id: 'n1',
  email: 'salma@amal.org',
  fullName: 'سلمى',
  role: 'NURSE',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

function request(id: string, overrides: Partial<CleaningRequestView> = {}): CleaningRequestView {
  return {
    id,
    kind: 'CLEANING',
    status: 'PENDING',
    department: { id: 'w', name: 'القلبية', code: 'CARDIOLOGY' },
    place: 'غرفة 12',
    operatingRoom: null,
    bed: null,
    note: null,
    requestedBy: 'سلمى',
    assignedTo: null,
    mine: true,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

let requests: CleaningRequestView[];
let noDepartment: boolean;

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
  noDepartment = false;
  requests = [
    request('r1'),
    request('r2', {
      place: 'الممر',
      mine: false,
      requestedBy: 'هدى',
      status: 'IN_PROGRESS',
      assignedTo: { id: 'c1', fullName: 'أم علي' },
    }),
  ];
  useSessionStore.setState({ status: 'authenticated', user: NURSE });
  fake.respond((config) => {
    if (config.url === '/cleaning-requests/department') {
      return noDepartment
        ? { status: 403, data: { error: { code: 'FORBIDDEN', message: 'no' } } }
        : { status: 200, data: { requests } };
    }
    if (config.url === '/cleaning-requests' && config.method === 'post') {
      const body = JSON.parse(config.data as string);
      const created = request('r3', { place: body.place, note: body.note || null });
      requests = [created, ...requests];
      return { status: 201, data: { request: created } };
    }
    if (config.url === '/cleaning-requests/r1' && config.method === 'delete') {
      requests = requests.map((r) => (r.id === 'r1' ? { ...r, status: 'CANCELLED' } : r));
      return { status: 200, data: { request: requests[0] } };
    }
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('NurseCleaningPage', () => {
  it('lists the department requests with how each is going', async () => {
    renderApp('/nurse/cleaning');
    const list = await screen.findByRole('region', { name: 'طلبات القسم' });
    const mine = await within(list).findByLabelText('غرفة 12');
    expect(mine).toHaveTextContent('طلبك');
    expect(mine).toHaveTextContent('بالانتظار');
    expect(within(mine).getByRole('button', { name: 'إلغاء الطلب' })).toBeInTheDocument();
    const other = within(list).getByLabelText('الممر');
    expect(other).toHaveTextContent('طلب هدى');
    expect(other).toHaveTextContent('عم ينضّف أم علي');
    expect(within(other).queryByRole('button')).toBeNull();
  });

  it('a quick place fills the form; sending needs a place', async () => {
    renderApp('/nurse/cleaning');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'اطلب تنظيف' }));
    expect(await screen.findByText('هالحقل مطلوب')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'غرفة الانتظار' }));
    expect(screen.getByLabelText(/المكان/)).toHaveValue('غرفة الانتظار');
    expect(screen.getByRole('button', { name: 'غرفة الانتظار' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.type(screen.getByLabelText(/ملاحظة/), 'كاسة مكسورة');
    await user.click(screen.getByRole('button', { name: 'اطلب تنظيف' }));

    expect(
      await screen.findByText('انبعت طلب تنظيف غرفة الانتظار لعمّال القسم'),
    ).toBeInTheDocument();
    const post = fake.calls.find((c) => c.method === 'post')!;
    expect(JSON.parse(post.data as string)).toEqual({
      place: 'غرفة الانتظار',
      note: 'كاسة مكسورة',
    });
    expect(screen.getByLabelText(/المكان/)).toHaveValue('');
    expect(
      await within(screen.getByRole('region', { name: 'طلبات القسم' })).findByLabelText(
        'غرفة الانتظار',
      ),
    ).toBeInTheDocument();
  });

  it('cancelling my waiting request asks first', async () => {
    renderApp('/nurse/cleaning');
    const user = userEvent.setup();
    const mine = await screen.findByLabelText('غرفة 12');
    await user.click(within(mine).getByRole('button', { name: 'إلغاء الطلب' }));
    const dialog = await screen.findByRole('dialog', { name: 'إلغاء طلب تنظيف غرفة 12؟' });
    await user.click(within(dialog).getByRole('button', { name: 'إلغاء الطلب' }));

    expect(await screen.findByText('انلغى الطلب')).toBeInTheDocument();
    expect(
      await within(await screen.findByLabelText('غرفة 12')).findByText('ملغى'),
    ).toBeInTheDocument();
  });

  it('a nurse without a department is told so', async () => {
    noDepartment = true;
    renderApp('/nurse/cleaning');
    expect(await screen.findByText('لسا مو مسجّل بقسم')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'اطلب تنظيف' })).toBeNull();
  });
});
