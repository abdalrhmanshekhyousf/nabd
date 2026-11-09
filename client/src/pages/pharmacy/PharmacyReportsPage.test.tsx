import type { PharmacyReportData, ReportView } from '@nabd/shared';
import { screen, waitFor, within } from '@testing-library/react';
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

const user = (role: 'PHARMACIST' | 'ADMIN'): SessionUser => ({
  id: role,
  email: `${role}@amal.org`,
  fullName: role === 'ADMIN' ? 'المدير' : 'رامي العطار',
  role,
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
});

const DATA: PharmacyReportData = {
  prescriptions: { dispensed: 12, withMissing: 2, waiting: 3 },
  dispensed: [{ name: 'أملوديبين 5 ملغ', unit: 'علبة', quantity: 9 }],
  unavailable: [{ drugName: 'ريفاروكسابان', times: 2 }],
  received: [],
  low: [{ name: 'أسبرين 81 ملغ', unit: 'علبة', quantity: 0, minQuantity: 10 }],
  outOfStock: 1,
};

const REPORT: ReportView = {
  id: 'r1',
  kind: 'PHARMACY',
  periodFrom: '2026-11-01T00:00:00.000Z',
  periodTo: '2026-11-08T00:00:00.000Z',
  data: DATA,
  notes: 'نحتاج طلبية',
  authorName: 'رامي العطار',
  readAt: null,
  createdAt: '2026-11-08T09:00:00.000Z',
};

let sent: ReportView[];

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
  sent = [];
  fake.respond((config) => {
    if (config.url === '/reports/preview') return { status: 200, data: { data: DATA } };
    if (config.url === '/reports' && config.method === 'post') {
      sent = [REPORT];
      return { status: 201, data: { report: REPORT } };
    }
    if (config.url === '/reports') return { status: 200, data: { reports: sent } };
    if (config.url === '/reports/r1') {
      sent = [{ ...REPORT, readAt: new Date().toISOString() }];
      return { status: 200, data: { report: sent[0] } };
    }
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('PharmacyReportsPage (task 3.11)', () => {
  it('previews the period, switches presets and sends with notes', async () => {
    useSessionStore.setState({ status: 'authenticated', user: user('PHARMACIST') });
    renderApp('/pharmacy/reports');
    const preview = await screen.findByRole('region', { name: 'معاينة التقرير' });
    expect(await within(preview).findByText('12')).toBeInTheDocument();
    expect(within(preview).getByLabelText('اسم الدواء 1')).toHaveValue('ريفاروكسابان');
    expect(within(preview).getByLabelText('عدد المرات 1')).toHaveValue('2');
    expect(preview).toHaveTextContent('0 علبة من أصل حد أدنى 10');
    expect(screen.getByText('ما بعتت تقارير لسا.')).toBeInTheDocument();

    const u = userEvent.setup();
    await u.click(screen.getByRole('radio', { name: 'الشهر الماضي' }));
    expect(screen.getByRole('radio', { name: 'الشهر الماضي' })).toBeChecked();
    const asked = fake.calls.filter((c) => c.url === '/reports/preview').at(-1)!;
    const { from, to } = asked.params as { from: string; to: string };
    expect(new Date(from).getDate()).toBe(1);
    expect(new Date(to).getDate()).toBe(1);

    await u.type(screen.getByLabelText('ملاحظات للمدير'), 'نحتاج طلبية');
    await u.click(screen.getByRole('button', { name: 'إرسال للمدير' }));
    const post = fake.calls.find((c) => c.method === 'post')!;
    expect(JSON.parse(post.data as string)).toEqual({
      kind: 'PHARMACY',
      from,
      to,
      notes: 'نحتاج طلبية',
    });
    const list = await screen.findByRole('region', { name: 'التقارير المبعوتة' });
    expect(await within(list).findByText('ما انقرأ لسا')).toBeInTheDocument();
    expect(screen.getByLabelText('ملاحظات للمدير')).toHaveValue('');
  });

  it('the pharmacist corrects the missing medicines before sending', async () => {
    useSessionStore.setState({ status: 'authenticated', user: user('PHARMACIST') });
    renderApp('/pharmacy/reports');
    const u = userEvent.setup();
    const times = await screen.findByLabelText('عدد المرات 1');
    await u.clear(times);
    await u.type(times, '٣');
    await u.click(screen.getByRole('button', { name: 'إضافة دواء' }));
    // An empty new line is refused.
    await u.click(screen.getByRole('button', { name: 'إرسال للمدير' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('كل دواء بدو اسم');
    expect(fake.calls.some((c) => c.method === 'post')).toBe(false);
    await u.type(screen.getByLabelText('اسم الدواء 2'), 'إنسولين');
    await u.click(screen.getByRole('button', { name: 'إرسال للمدير' }));
    const post = fake.calls.find((c) => c.method === 'post')!;
    expect(JSON.parse(post.data as string).unavailable).toEqual([
      { drugName: 'ريفاروكسابان', times: 3 },
      { drugName: 'إنسولين', times: 1 },
    ]);
  });

  it('removing a line and going back to the worked-out list', async () => {
    useSessionStore.setState({ status: 'authenticated', user: user('PHARMACIST') });
    renderApp('/pharmacy/reports');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'حذف ريفاروكسابان' }));
    expect(screen.queryByLabelText('اسم الدواء 1')).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'رجّع القائمة متل ما طلعت' }));
    expect(screen.getByLabelText('اسم الدواء 1')).toHaveValue('ريفاروكسابان');
    await u.click(screen.getByRole('button', { name: 'إرسال للمدير' }));
    const post = fake.calls.find((c) => c.method === 'post')!;
    expect(JSON.parse(post.data as string)).not.toHaveProperty('unavailable');
  });

  it('printing puts the report alone on a sheet with the hospital and period', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    useSessionStore.setState({ status: 'authenticated', user: user('PHARMACIST') });
    renderApp('/pharmacy/reports');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'طباعة' }));
    const sheet = await screen.findByTestId('print-sheet');
    expect(sheet).toHaveTextContent('مستشفى الأمل');
    expect(sheet).toHaveTextContent('تقرير الصيدلية');
    expect(sheet).toHaveTextContent('ريفاروكسابان');
    expect(document.body).toHaveClass('printing');
    await waitFor(() => expect(print).toHaveBeenCalled());
    window.dispatchEvent(new Event('afterprint'));
    await waitFor(() => expect(screen.queryByTestId('print-sheet')).not.toBeInTheDocument());
    expect(document.body).not.toHaveClass('printing');
    print.mockRestore();
  });

  it('the admin sees the new report and opening it marks it read', async () => {
    sent = [REPORT];
    useSessionStore.setState({ status: 'authenticated', user: user('ADMIN') });
    renderApp('/admin/reports');
    expect(await screen.findByText('جديد')).toBeInTheDocument();
    expect(screen.getByText('الصيدلية · رامي العطار')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /الصيدلية/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('نحتاج طلبية')).toBeInTheDocument();
    expect(fake.calls.some((c) => c.url === '/reports/r1')).toBe(true);
  });

  it('a notification link opens the report straight away', async () => {
    sent = [REPORT];
    useSessionStore.setState({ status: 'authenticated', user: user('ADMIN') });
    renderApp('/admin/reports?open=r1');
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('أملوديبين 5 ملغ')).toBeInTheDocument();
  });
});
