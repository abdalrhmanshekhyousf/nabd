import type { MedicationReminderView, MyMedication } from '@nabd/shared';
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

const PATIENT: SessionUser = {
  id: 'u1',
  email: 'sara@mail.com',
  fullName: 'سارة',
  role: 'PATIENT',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const med = (more: Partial<MyMedication>): MyMedication => ({
  prescriptionItemId: 'i1',
  drugName: 'أملوديبين',
  dose: '5 ملغ',
  frequency: 'مرتين باليوم',
  durationDays: 10,
  instructions: null,
  doctorName: 'د. سامي',
  prescribedAt: new Date().toISOString(),
  reminder: null,
  ...more,
});

let medications: MyMedication[];
let reminders: MedicationReminderView[];

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
  reminders = [];
  medications = [
    med({}),
    med({
      prescriptionItemId: 'i2',
      drugName: 'ميتفورمين',
      dose: '500 ملغ',
      frequency: 'مرة باليوم',
      durationDays: null,
      reminder: {
        id: 'r2',
        prescriptionItemId: 'i2',
        drugName: 'ميتفورمين',
        dose: '500 ملغ',
        times: ['08:00'],
        startDate: '2026-11-12',
        endDate: null,
        active: true,
      },
    }),
  ];
  useSessionStore.setState({ status: 'authenticated', user: PATIENT });
  fake.respond((config) => {
    if (config.url === '/patients/me/medications') {
      return { status: 200, data: { medications, reminders } };
    }
    if (config.url === '/patients/me/reminders' && config.method === 'post') {
      return { status: 201, data: { reminder: {} } };
    }
    if (config.url?.startsWith('/patients/me/reminders/')) {
      return { status: 200, data: { reminder: {} } };
    }
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

const posted = () =>
  JSON.parse(
    fake.calls.find((c) => c.method === 'post' && c.url === '/patients/me/reminders')!
      .data as string,
  );

describe('MedicationsPage (task 3.26)', () => {
  it('suggests the dose times from the prescription and saves the reminder for its days', async () => {
    renderApp('/patient/medications');
    const user = userEvent.setup();
    const card = await screen.findByLabelText('أملوديبين', { selector: 'section' });
    await user.click(within(card).getByRole('button', { name: 'ذكّرني' }));
    expect(within(card).getByLabelText('وقت الجرعة 1')).toHaveValue('08:00');
    expect(within(card).getByLabelText('وقت الجرعة 2')).toHaveValue('20:00');
    expect(card).toHaveTextContent('من اليوم ولمدة 10 أيام');
    await user.click(within(card).getByRole('button', { name: 'شيل وقت 20:00' }));
    await user.click(within(card).getByRole('button', { name: 'حفظ التذكير' }));
    expect(await screen.findByText('رح نذكّرك بـ أملوديبين')).toBeInTheDocument();
    const body = posted();
    expect(body).toMatchObject({
      prescriptionItemId: 'i1',
      drugName: 'أملوديبين',
      dose: '5 ملغ',
      times: ['08:00'],
    });
    expect(Date.parse(body.endDate) - Date.parse(body.startDate)).toBe(9 * 86_400_000);
  });

  it('shows a set reminder with its times, and pauses it', async () => {
    renderApp('/patient/medications');
    const card = await screen.findByLabelText('ميتفورمين', { selector: 'section' });
    expect(within(card).getByRole('list', { name: 'أوقات الجرعات' })).toHaveTextContent('08:00');
    await userEvent.setup().click(within(card).getByRole('button', { name: 'إيقاف التذكير' }));
    expect(await screen.findByText('وقف التذكير')).toBeInTheDocument();
    const patch = fake.calls.find((c) => c.method === 'patch')!;
    expect(patch.url).toBe('/patients/me/reminders/r2');
    expect(JSON.parse(patch.data as string)).toEqual({ active: false });
  });

  it('adds a reminder for a medicine of my own', async () => {
    renderApp('/patient/medications');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'تذكير لدواء تاني' }));
    const own = screen.getByRole('region', { name: 'تذكيرات تانية' });
    await user.click(within(own).getByRole('button', { name: 'حفظ التذكير' }));
    expect(within(own).getByRole('alert')).toHaveTextContent('اكتب الدواء والجرعة');
    await user.type(within(own).getByLabelText('اسم الدواء'), 'فيتامين د');
    await user.type(within(own).getByLabelText('الجرعة'), 'حبة');
    await user.click(within(own).getByRole('button', { name: 'حفظ التذكير' }));
    expect(posted()).toMatchObject({
      prescriptionItemId: null,
      drugName: 'فيتامين د',
      times: ['08:00'],
      endDate: null,
    });
  });
});
