import type { ConsultationView } from '@nabd/shared';
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
});
