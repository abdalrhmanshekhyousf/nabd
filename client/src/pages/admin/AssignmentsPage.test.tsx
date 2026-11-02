import { screen, waitFor, within } from '@testing-library/react';
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
import type { Assignments } from './AssignmentsPage';

const fake = fakeApi(api);

const ADMIN: SessionUser = {
  id: 'u1',
  email: 'admin@nabd.demo',
  fullName: 'مدير المستشفى',
  role: 'ADMIN',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const ER = { id: 'd1', name: 'الإسعاف', code: 'EMERGENCY' as const };
const WARD = { id: 'd2', name: 'جناح الأطفال', code: null };

let data: Assignments;
let refuse = false;

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
  refuse = false;
  data = {
    departments: [ER, WARD],
    nurses: [{ id: 'n1', fullName: 'لينا', isActive: true, departmentId: ER.id }],
    cleaners: [{ id: 'c1', fullName: 'أبو أحمد', isActive: true, departmentIds: [] }],
  };
  useSessionStore.setState({ status: 'authenticated', user: ADMIN });
  fake.respond((config) => {
    if (config.method === 'put') {
      if (refuse) return apiError(404, 'NOT_FOUND', 'المطلوب غير موجود');
      const body = JSON.parse(config.data as string);
      const [, kind, id] = config.url!.match(/^\/assignments\/(nurses|cleaners)\/(.+)$/)!;
      if (kind === 'nurses') {
        data.nurses = data.nurses.map((n) => (n.id === id ? { ...n, ...body } : n));
      } else {
        data.cleaners = data.cleaners.map((c) => (c.id === id ? { ...c, ...body } : c));
      }
      return { status: 200, data: {} };
    }
    if (config.url === '/assignments') return { status: 200, data: structuredClone(data) };
    return { status: 200, data: { staff: [], departments: [] } };
  });
});

const puts = () => fake.calls.filter((c) => c.method === 'put');

describe('AssignmentsPage', () => {
  it('shows which departments have no nurse or no cleaner', async () => {
    renderApp('/admin/assignments');

    const coverage = await screen.findByRole('region', { name: 'التغطية بالأقسام' });
    expect(within(coverage).getByText('ممرضين: 1')).toBeInTheDocument();
    expect(within(coverage).getByText('بلا ممرضين')).toBeInTheDocument();
    expect(within(coverage).getAllByText('بلا تنظيف')).toHaveLength(2);
  });

  it('moves a nurse to another department at once', async () => {
    renderApp('/admin/assignments');
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByRole('combobox', { name: 'قسم لينا' }), WARD.id);

    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0].url).toBe('/assignments/nurses/n1');
    expect(JSON.parse(puts()[0].data as string)).toEqual({ departmentId: WARD.id });
    expect(await screen.findByText('تم نقل لينا لقسم جناح الأطفال')).toBeInTheDocument();
  });

  it('adds and removes departments for a cleaner', async () => {
    renderApp('/admin/assignments');
    const user = userEvent.setup();
    const group = await screen.findByRole('group', { name: 'أقسام أبو أحمد' });
    expect(screen.getByText('بلا أقسام')).toBeInTheDocument();

    await user.click(within(group).getByRole('button', { name: 'الإسعاف' }));
    await waitFor(() =>
      expect(within(group).getByRole('button', { name: 'الإسعاف' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    await user.click(within(group).getByRole('button', { name: 'جناح الأطفال' }));
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(JSON.parse(puts()[1].data as string)).toEqual({ departmentIds: [ER.id, WARD.id] });

    await user.click(within(group).getByRole('button', { name: 'الإسعاف' }));
    await waitFor(() => expect(puts()).toHaveLength(3));
    expect(JSON.parse(puts()[2].data as string)).toEqual({ departmentIds: [WARD.id] });
    await waitFor(() =>
      expect(within(group).getByRole('button', { name: 'الإسعاف' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
  });

  it('puts things back when the server refuses', async () => {
    refuse = true;
    renderApp('/admin/assignments');
    const user = userEvent.setup();
    const group = await screen.findByRole('group', { name: 'أقسام أبو أحمد' });

    await user.click(within(group).getByRole('button', { name: 'الإسعاف' }));

    await waitFor(() => expect(puts()).toHaveLength(1));
    await waitFor(() =>
      expect(within(group).getByRole('button', { name: 'الإسعاف' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
  });

  it('sends the admin to add departments first', async () => {
    data = { departments: [], nurses: [], cleaners: [] };
    renderApp('/admin/assignments');

    expect(await screen.findByText('لازم تضيف أقسام أول')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'روح للأقسام' })).toHaveAttribute(
      'href',
      '/admin/departments',
    );
  });
});
