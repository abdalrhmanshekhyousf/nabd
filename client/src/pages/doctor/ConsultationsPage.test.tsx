import type { ConsultationView, PatientFile } from '@nabd/shared';
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

const LINA: SessionUser = {
  id: 'lina',
  email: 'lina@amal.org',
  fullName: 'د. لينا حداد',
  role: 'DOCTOR',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const consultation = (more: Partial<ConsultationView>): ConsultationView => ({
  id: 'c1',
  status: 'PENDING',
  question: 'تخطيط القلب فيه تغيرات',
  reply: null,
  requesterId: 'sami',
  requesterName: 'د. سامي',
  consultantId: 'lina',
  consultantName: 'د. لينا حداد',
  createdAt: new Date().toISOString(),
  answeredAt: null,
  patient: {
    patientId: 'p1',
    fullName: 'سارة',
    isAnonymous: false,
    gender: 'FEMALE',
    dateOfBirth: null,
  },
  ...more,
});

let sent: ConsultationView[];
let open = true;

const FILE: PatientFile = {
  patient: {
    patientId: 'p1',
    fullName: 'سارة',
    isAnonymous: false,
    gender: 'FEMALE',
    dateOfBirth: null,
    phone: null,
    bloodType: 'O+',
    nationalId: null,
    address: null,
  },
  record: {
    id: 'r1',
    doctorName: 'د. سامي',
    allergies: 'البنسلين',
    chronicConditions: null,
    notes: null,
  },
  reports: [
    {
      id: 'rep1',
      doctorName: 'د. سامي',
      title: 'زيارة أولى',
      diagnosis: null,
      content: 'ألم صدري',
      createdAt: new Date().toISOString(),
    },
  ],
  prescriptions: [],
  labTests: [
    {
      id: 'l1',
      code: 'CBC',
      priority: 'ROUTINE',
      status: 'REQUESTED',
      notes: null,
      doctorName: 'د. سامي',
      technicianName: null,
      result: null,
      abnormal: false,
      hasResultFile: false,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    },
  ] as PatientFile['labTests'],
  imaging: [],
  consultations: [],
};

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
  useSessionStore.setState({ status: 'authenticated', user: LINA });
  open = true;
  sent = [
    consultation({
      id: 'c2',
      requesterId: 'lina',
      requesterName: 'د. لينا حداد',
      consultantId: 'basel',
      consultantName: 'د. باسل',
      question: 'كسر قديم؟',
      patient: { ...consultation({}).patient, patientId: 'p2', fullName: 'عمر' },
    }),
  ];
  fake.respond((config) => {
    if (config.url === '/doctors/me/consultations/c1/file') {
      return open
        ? { status: 200, data: { consultation: consultation({}), file: FILE } }
        : { status: 403, data: { error: { code: 'CONSULTATION_CLOSED', message: 'closed' } } };
    }
    if (config.method === 'post' && config.url === '/doctors/me/consultations/c1/reply') {
      open = false;
      const body = JSON.parse(config.data as string);
      return {
        status: 200,
        data: { consultation: consultation({ status: 'ANSWERED', reply: body.reply }) },
      };
    }
    if (config.url === '/doctors/me/consultations') {
      return { status: 200, data: { received: [consultation({})], sent } };
    }
    if (config.method === 'delete' && config.url === '/doctors/me/consultations/c2') {
      sent = [{ ...sent[0]!, status: 'CANCELLED' }];
      return { status: 200, data: { consultation: sent[0] } };
    }
    if (config.url === '/doctors/me/status') return { status: 200, data: { status: 'AVAILABLE' } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('ConsultationsPage (task 3.12)', () => {
  it('shows the questions I received and sent; a notification link marks its question', async () => {
    renderApp('/doctor/consultations?open=c1');
    const received = await screen.findByRole('region', { name: 'وصلتني' });
    const row = within(received).getByLabelText('سارة');
    expect(row).toHaveTextContent('د. سامي');
    expect(row).toHaveTextContent('تخطيط القلب فيه تغيرات');
    expect(row).toHaveTextContent('ناطرة رد');
    expect(row).toHaveClass('bg-accent-soft');
    // Only the asker can withdraw.
    expect(within(row).queryByRole('button', { name: 'سحب' })).toBeNull();

    const mine = screen.getByRole('region', { name: 'بعتّها' });
    const asked = within(mine).getByLabelText('عمر');
    await userEvent.setup().click(within(asked).getByRole('button', { name: 'سحب' }));
    expect(await within(mine).findByText('مسحوبة')).toBeInTheDocument();
  });

  it('the consulted doctor opens the file read-only from the question (task 3.13)', async () => {
    renderApp('/doctor/consultations');
    const received = await screen.findByRole('region', { name: 'وصلتني' });
    await userEvent.setup().click(within(received).getByRole('link', { name: 'فتح الملف' }));

    const note = await screen.findByRole('note', { name: 'سؤال د. سامي' });
    expect(note).toHaveTextContent('تخطيط القلب فيه تغيرات');
    expect(note).toHaveTextContent('مفتوح إلك للقراءة');
    expect(screen.getByRole('heading', { name: 'سارة' })).toBeInTheDocument();
    expect(screen.getByText('البنسلين')).toBeInTheDocument();
    expect(screen.getByText('ألم صدري')).toBeInTheDocument();
    // No writing tools, no withdrawing the treating doctor's orders.
    expect(screen.queryByRole('button', { name: 'كتابة تقرير' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'طلب استشارة' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'سحب الطلب' })).toBeNull();
  });

  it('once the question is closed the file says so (task 3.13)', async () => {
    open = false;
    renderApp('/doctor/consultations/c1');
    expect(await screen.findByText('انتهت هالاستشارة')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'رجوع للاستشارات' })).toHaveAttribute(
      'href',
      '/doctor/consultations?open=c1',
    );
  });

  it('the consultant replies; the reply is sent and the page goes back to the list (task 3.14)', async () => {
    renderApp('/doctor/consultations/c1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'الرد على الاستشارة' }));
    // Ordering tests and imaging is offered while consulting.
    expect(screen.getByRole('button', { name: 'طلب تحليل' })).toBeInTheDocument();
    const dialog = await screen.findByRole('dialog', { name: 'الرد على سؤال د. سامي' });
    expect(dialog).toHaveTextContent('تخطيط القلب فيه تغيرات');
    await user.click(within(dialog).getByRole('button', { name: 'إرسال الرد' }));
    expect(await within(dialog).findByText('هالحقل مطلوب')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('التشخيص'), 'ألم غير نموذجي');
    await user.type(within(dialog).getByLabelText(/ردّك/), 'إيكو وتروبونين');
    await user.click(within(dialog).getByRole('button', { name: 'إرسال الرد' }));

    expect(await screen.findByText('وصل ردّك لـ د. سامي')).toBeInTheDocument();
    const post = fake.calls.find((c) => c.url?.endsWith('/reply'))!;
    expect(JSON.parse(post.data as string)).toEqual({
      reply: 'إيكو وتروبونين',
      diagnosis: 'ألم غير نموذجي',
    });
    expect(await screen.findByRole('region', { name: 'وصلتني' })).toBeInTheDocument();
  });
});
