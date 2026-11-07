import type { LabBoardItem } from '@nabd/shared';
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

const TECH: SessionUser = {
  id: 'l1',
  email: 'heba@amal.org',
  fullName: 'هبة',
  role: 'LAB_TECHNICIAN',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

function test(id: string, code: LabBoardItem['code'], more: Partial<LabBoardItem> = {}) {
  return {
    id,
    code,
    priority: 'ROUTINE',
    status: 'REQUESTED',
    notes: null,
    doctorName: 'د. سامي',
    technicianName: null,
    result: null,
    hasResultFile: false,
    abnormal: null,
    createdAt: new Date(Date.now() - 25 * 60_000).toISOString(),
    startedAt: null,
    completedAt: null,
    patient: {
      id: 'p1',
      fullName: 'سارة',
      isAnonymous: false,
      gender: 'FEMALE',
      dateOfBirth: '1990-01-01',
    },
    mine: false,
    ...more,
  } satisfies LabBoardItem;
}

let tests: LabBoardItem[];

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
  tests = [
    test('t1', 'TROPONIN', { priority: 'URGENT', notes: 'ألم صدري' }),
    test('t2', 'CBC'),
    test('t3', 'UREA', { status: 'IN_PROGRESS', technicianName: 'عمر' }),
  ];
  useSessionStore.setState({ status: 'authenticated', user: TECH });
  fake.respond((config) => {
    if (config.url === '/lab-tests') return { status: 200, data: { tests } };
    const start = config.url?.match(/^\/lab-tests\/(.+)\/start$/);
    if (start) {
      const started = {
        ...tests.find((x) => x.id === start[1])!,
        status: 'IN_PROGRESS' as const,
        mine: true,
      };
      tests = tests.map((x) => (x.id === started.id ? started : x));
      return { status: 200, data: { test: started } };
    }
    const result = config.url?.match(/^\/lab-tests\/(.+)\/result$/);
    if (result) {
      const done = { ...tests.find((x) => x.id === result[1])!, status: 'DONE' as const };
      tests = tests.map((x) => (x.id === done.id ? done : x));
      return { status: 200, data: { test: done } };
    }
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('LabBoardPage', () => {
  it('lists waiting tests, urgent first, with whose they are and who is on the rest', async () => {
    renderApp('/lab/requests');
    const waiting = await screen.findByRole('region', { name: 'بانتظار' });
    const cards = within(waiting).getAllByRole('listitem');
    expect(cards[0]).toHaveTextContent('التروبونين');
    expect(cards[0]).toHaveTextContent('مستعجل');
    expect(cards[0]).toHaveTextContent('ألم صدري');
    expect(cards[0]).toHaveTextContent('سارة');
    expect(cards[0]).toHaveTextContent('طلبه د. سامي');
    expect(cards[0]).toHaveTextContent('0:25');
    expect(screen.getByRole('region', { name: 'عم يشتغل عليها غيري' })).toHaveTextContent(
      'عم يشتغل عليه عمر',
    );
  });

  it('taking a test moves it to my work', async () => {
    renderApp('/lab/requests');
    const user = userEvent.setup();
    const card = await screen.findByLabelText('تعداد دم كامل CBC');
    await user.click(within(card).getByRole('button', { name: 'بلّشت' }));
    expect(await screen.findByText('بلّشت بـ تعداد دم كامل CBC')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'شغلي هلق' })).toHaveTextContent(
      'تعداد دم كامل CBC',
    );
  });

  it('a result needs values or a file; it is sent as a form with the flag and the file', async () => {
    renderApp('/lab/requests');
    const user = userEvent.setup();
    const card = await screen.findByLabelText('التروبونين');
    await user.click(within(card).getByRole('button', { name: 'إدخال النتيجة' }));
    const dialog = await screen.findByRole('dialog', { name: 'نتيجة التروبونين' });
    await user.click(within(dialog).getByRole('button', { name: 'حفظ النتيجة' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'اكتب القيم أو ارفع ملف النتيجة',
    );

    await user.upload(
      within(dialog).getByLabelText('ملف النتيجة (PDF أو صورة، اختياري)'),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
    );
    expect(within(dialog).queryByText('notes.txt')).toBeNull();

    await user.type(within(dialog).getByLabelText('القيم'), 'Troponin I: 0.8 ng/mL');
    await user.click(within(dialog).getByRole('radio', { name: 'خارج الطبيعي' }));
    await user.upload(
      within(dialog).getByLabelText('ملف النتيجة (PDF أو صورة، اختياري)'),
      new File(['%PDF-1.4'], 'troponin.pdf', { type: 'application/pdf' }),
    );
    expect(within(dialog).getByText('troponin.pdf')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'حفظ النتيجة' }));

    expect(
      await screen.findByText('انحفظت نتيجة التروبونين بملف سارة، ووصل للطبيب إشعار'),
    ).toBeInTheDocument();
    const form = fake.calls.find((c) => c.url === '/lab-tests/t1/result')!.data as FormData;
    expect(form.get('result')).toBe('Troponin I: 0.8 ng/mL');
    expect(form.get('abnormal')).toBe('true');
    expect((form.get('file') as File).name).toBe('troponin.pdf');
    expect(await screen.findByRole('region', { name: 'جاهزة اليوم' })).toHaveTextContent(
      'التروبونين',
    );
  });

  it('says so when nothing waits', async () => {
    tests = [];
    renderApp('/lab/requests');
    expect(await screen.findByText('ما في طلبات تحاليل هلق')).toBeInTheDocument();
  });
});
