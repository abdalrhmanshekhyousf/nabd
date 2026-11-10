import type { BedMapDepartment } from '@nabd/shared';
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

const DOCTOR: SessionUser = {
  id: 'd1',
  email: 'sami@amal.org',
  fullName: 'د. سامي',
  role: 'DOCTOR',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const at = new Date(Date.now() - 2 * 3_600_000).toISOString();
const bed = (id: string, label: string, status: string, patient?: string) => ({
  id,
  label,
  status,
  statusChangedAt: at,
  admittedAt: patient ? at : null,
  patient: patient
    ? {
        patientId: `p-${id}`,
        fullName: patient,
        isAnonymous: false,
        gender: null,
        dateOfBirth: null,
      }
    : null,
});

const MAP = [
  {
    department: { id: 'in', name: 'Internal', code: 'INTERNAL_MEDICINE' },
    rooms: [
      {
        id: 'r1',
        number: '101',
        floor: 1,
        beds: [bed('b1', '1', 'OCCUPIED', 'سارة'), bed('b2', '2', 'EMPTY')],
      },
      { id: 'r2', number: '201', floor: 2, beds: [bed('b3', '1', 'CLEANING')] },
    ],
  },
  {
    department: { id: 'ca', name: 'Cardio', code: 'CARDIOLOGY' },
    rooms: [{ id: 'r3', number: '301', floor: 3, beds: [bed('b4', '1', 'RESERVED')] }],
  },
] as BedMapDepartment[];

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  queryClient.clear();
  useSessionStore.setState({ status: 'authenticated', user: DOCTOR });
  fake.respond((config) => {
    if (config.url === '/beds/map') return { status: 200, data: { departments: MAP } };
    if (config.url === '/doctors/me/status') return { status: 200, data: { status: 'AVAILABLE' } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('BedMapPage (task 3.18)', () => {
  it('shows a department floor by floor, each bed in its state with its patient', async () => {
    renderApp('/doctor/bed-map');
    const floor1 = await screen.findByRole('region', { name: 'الطابق 1' });
    expect(within(floor1).getByLabelText('سرير 1، مشغول سارة')).toHaveTextContent('سارة');
    expect(within(floor1).getByLabelText('سرير 2، فارغ')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'الطابق 2' })).toHaveTextContent('قيد التنظيف');
    expect(screen.getByRole('list', { name: 'دليل الألوان' })).toHaveTextContent('مشغول1');
    expect(screen.getByText('المستشفى: 1 مشغول من 4')).toBeInTheDocument();
  });

  it('switches department and keeps it in the address', async () => {
    renderApp('/doctor/bed-map');
    const tabs = await screen.findByRole('tablist', { name: 'الأقسام' });
    const cardio = within(tabs).getAllByRole('tab')[1]!;
    expect(cardio).toHaveTextContent('0 مشغول من 1');
    await userEvent.setup().click(cardio);
    expect(cardio).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('region', { name: 'الطابق 3' })).toHaveTextContent('محجوز');
    expect(screen.queryByRole('region', { name: 'الطابق 1' })).toBeNull();
  });
});
