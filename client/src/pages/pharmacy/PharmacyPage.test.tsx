import type { PharmacyPrescription } from '@nabd/shared';
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

const PHARMACIST: SessionUser = {
  id: 'ph1',
  email: 'rami@amal.org',
  fullName: 'رامي العطار',
  role: 'PHARMACIST',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const AMLO5 = '11111111-1111-4111-8111-111111111111';
const AMLO10 = '22222222-2222-4222-8222-222222222222';

function prescription(more: Partial<PharmacyPrescription> = {}): PharmacyPrescription {
  return {
    id: 'rx1',
    doctorName: 'د. سامي',
    status: 'PENDING',
    notes: 'بعد الأكل',
    createdAt: new Date(Date.now() - 40 * 60_000).toISOString(),
    dispensedAt: null,
    dispensedByName: null,
    patient: {
      id: 'p1',
      fullName: 'سارة',
      isAnonymous: false,
      gender: 'FEMALE',
      dateOfBirth: null,
    },
    allergies: 'البنسلين',
    items: [
      {
        id: 'i1',
        drugName: 'أملوديبين',
        dose: '5 ملغ',
        frequency: 'مرة باليوم',
        durationDays: 30,
        instructions: null,
        dispensed: null,
        matches: [
          { id: AMLO5, name: 'أملوديبين 5 ملغ مضغوطات', unit: 'علبة', quantity: 3 },
          { id: AMLO10, name: 'أملوديبين 10 ملغ مضغوطات', unit: 'علبة', quantity: 60 },
        ],
      },
      {
        id: 'i2',
        drugName: 'دواء نادر',
        dose: '1 حبة',
        frequency: 'عند اللزوم',
        durationDays: null,
        instructions: null,
        dispensed: null,
        matches: [],
      },
    ],
    ...more,
  };
}

let list: PharmacyPrescription[];

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
  list = [prescription()];
  useSessionStore.setState({ status: 'authenticated', user: PHARMACIST });
  fake.respond((config) => {
    if (config.url === '/pharmacy/prescriptions')
      return { status: 200, data: { prescriptions: list } };
    if (config.url === '/pharmacy/prescriptions/rx1/dispense') {
      list = [
        prescription({
          status: 'DISPENSED',
          dispensedAt: new Date().toISOString(),
          dispensedByName: 'رامي العطار',
          items: prescription().items.map((item, i) => ({
            ...item,
            matches: [],
            dispensed:
              i === 0 ? { quantity: 2, name: 'أملوديبين 5 ملغ مضغوطات', unit: 'علبة' } : null,
          })),
        }),
      ];
      return {
        status: 200,
        data: { prescription: list[0], lowItems: ['أملوديبين 5 ملغ مضغوطات'] },
      };
    }
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('PharmacyPage', () => {
  it('shows waiting prescriptions with the allergies and each medicine', async () => {
    renderApp('/pharmacy/prescriptions');
    const waiting = await screen.findByRole('region', { name: 'بانتظار الصرف' });
    const card = within(waiting).getByLabelText('سارة');
    expect(card).toHaveTextContent('حساسية: البنسلين');
    expect(card).toHaveTextContent('أملوديبين · 5 ملغ');
    expect(card).toHaveTextContent('مرة باليوم · لـ 30 يوم');
    expect(card).toHaveTextContent('كتبها د. سامي');
    expect(card).toHaveTextContent('0:40');
  });

  it('dispensing picks the best match, refuses more than in stock, and sends each line', async () => {
    renderApp('/pharmacy/prescriptions');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'صرف' }));
    const dialog = await screen.findByRole('dialog', { name: 'صرف وصفة سارة' });
    expect(within(dialog).getByRole('note')).toHaveTextContent('انتبه: عنده حساسية من البنسلين');

    const amlo = within(dialog).getByLabelText('أملوديبين');
    expect(within(amlo).getByRole('combobox')).toHaveValue(AMLO5);
    const rare = within(dialog).getByLabelText('دواء نادر');
    expect(within(rare).getByRole('combobox')).toHaveValue('');
    expect(
      within(rare).getByRole('option', { name: 'ما في شي متله بالمخزون' }),
    ).toBeInTheDocument();
    expect(within(rare).getByLabelText('الكمية')).toBeDisabled();

    const count = within(amlo).getByLabelText('الكمية');
    await user.clear(count);
    await user.type(count, '5');
    expect(await within(amlo).findByText('بالمخزون 3 علبة بس')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'تأكيد الصرف' })).toBeDisabled();
    await user.clear(count);
    await user.type(count, '٢');
    await user.click(within(dialog).getByRole('button', { name: 'تأكيد الصرف' }));

    expect(await screen.findByText('انصرفت وصفة سارة')).toBeInTheDocument();
    expect(
      await screen.findByText('وصلت للحد الأدنى: أملوديبين 5 ملغ مضغوطات'),
    ).toBeInTheDocument();
    const post = fake.calls.find((c) => c.url === '/pharmacy/prescriptions/rx1/dispense')!;
    expect(JSON.parse(post.data as string)).toEqual({
      lines: [
        { prescriptionItemId: 'i1', inventoryItemId: AMLO5, quantity: 2 },
        { prescriptionItemId: 'i2', inventoryItemId: null, quantity: 0 },
      ],
    });
    const done = await screen.findByRole('region', { name: 'مصروفة اليوم' });
    expect(done).toHaveTextContent('انصرف: 2 علبة أملوديبين 5 ملغ مضغوطات');
    expect(done).toHaveTextContent('ما كان متوفر');
    expect(done).toHaveTextContent('صرفها رامي العطار');
  });

  it('says so when nothing waits', async () => {
    list = [];
    renderApp('/pharmacy/prescriptions');
    expect(await screen.findByText('ما في وصفات بانتظار الصرف')).toBeInTheDocument();
  });
});
