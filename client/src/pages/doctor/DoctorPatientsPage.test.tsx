import type { PatientFile, PatientSummary } from '@nabd/shared';
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

const fake = fakeApi(api);

const DOCTOR: SessionUser = {
  id: 'd1',
  email: 'reem@amal.org',
  fullName: 'د. ريم العلي',
  role: 'DOCTOR',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const SARA = '0199a3d2-6c55-7000-8000-00000000000a';
const THIRTY_YEARS_AGO = `${new Date().getFullYear() - 30}-01-01`;

const PATIENTS: PatientSummary[] = [
  {
    patientId: SARA,
    fullName: 'سارة الأحمد',
    isAnonymous: false,
    gender: 'FEMALE',
    dateOfBirth: THIRTY_YEARS_AGO,
    phone: null,
    reportCount: 2,
    prescriptionCount: 1,
    lastReportAt: new Date().toISOString(),
  },
  {
    patientId: '0199a3d2-6c55-7000-8000-00000000000b',
    fullName: null,
    isAnonymous: true,
    gender: 'MALE',
    dateOfBirth: null,
    phone: null,
    reportCount: 0,
    prescriptionCount: 0,
    lastReportAt: null,
  },
];

const FILE: PatientFile = {
  patient: {
    patientId: SARA,
    fullName: 'سارة الأحمد',
    isAnonymous: false,
    gender: 'FEMALE',
    dateOfBirth: THIRTY_YEARS_AGO,
    phone: '0991 234 567',
    bloodType: 'A+',
    nationalId: null,
    address: null,
  },
  record: {
    id: 'r1',
    doctorName: 'د. ريم العلي',
    allergies: 'البنسلين',
    chronicConditions: 'ارتفاع ضغط الدم',
    notes: null,
  },
  reports: [
    {
      id: 'rep2',
      doctorName: 'د. ريم العلي',
      title: 'مراجعة',
      diagnosis: 'ضغط تحت السيطرة',
      content: 'الضغط 130/85.',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'rep1',
      doctorName: 'د. ريم العلي',
      title: 'زيارة أولى',
      diagnosis: null,
      content: 'بلشنا العلاج.',
      createdAt: new Date(Date.now() - 14 * 86_400_000).toISOString(),
    },
  ],
  prescriptions: [
    {
      id: 'p1',
      doctorName: 'د. ريم العلي',
      status: 'PENDING',
      notes: 'بعد الأكل',
      createdAt: new Date().toISOString(),
      dispensedAt: null,
      items: [
        {
          id: 'i1',
          drugName: 'أملوديبين',
          dose: '5 ملغ',
          frequency: 'مرة باليوم',
          durationDays: 30,
          instructions: null,
        },
      ],
    },
  ],
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
  useSessionStore.setState({ status: 'authenticated', user: DOCTOR });
  fake.respond((config) => {
    if (config.url === '/doctors/me/patients') {
      const search = (config.params?.search as string | undefined) ?? '';
      return {
        status: 200,
        data: { patients: PATIENTS.filter((p) => (p.fullName ?? '').includes(search)) },
      };
    }
    if (config.url === `/doctors/me/patients/${SARA}`) return { status: 200, data: FILE };
    if (config.url?.startsWith('/doctors/me/patients/')) {
      return apiError(404, 'NOT_FOUND', 'المطلوب غير موجود');
    }
    if (config.url === '/doctors/me/status') return { status: 200, data: { status: 'AVAILABLE' } };
    if (config.url === '/notifications') {
      return { status: 200, data: { notifications: [], unread: 0 } };
    }
    return { status: 200, data: {} };
  });
});

describe('DoctorPatientsPage', () => {
  it('lists my patients with their age and file counts', async () => {
    renderApp('/doctor/patients');

    const sara = await screen.findByRole('link', { name: /سارة الأحمد/ });
    expect(sara).toHaveTextContent('30 سنة · أنثى');
    expect(sara).toHaveTextContent('تقارير: 2');
    expect(sara).toHaveTextContent('وصفات: 1');
    expect(screen.getByRole('link', { name: /مريض مجهول الهوية/ })).toHaveTextContent(
      'ما في تقارير بعد',
    );
    expect(screen.getByText('عدد المرضى: 2')).toBeInTheDocument();
  });

  it('searches by name after a pause in typing', async () => {
    renderApp('/doctor/patients');
    const user = userEvent.setup();
    await screen.findByRole('link', { name: /سارة الأحمد/ });

    await user.type(screen.getByRole('searchbox', { name: 'بحث' }), 'زياد');

    expect(await screen.findByText('ما في مريض بهالاسم')).toBeInTheDocument();
    expect(fake.calls.at(-1)?.params).toMatchObject({ search: 'زياد' });
  });

  it('opens a patient’s file with alerts, reports and prescriptions', async () => {
    const router = renderApp('/doctor/patients');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('link', { name: /سارة الأحمد/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/doctor/patients/${SARA}`));
    expect(await screen.findByRole('heading', { name: 'سارة الأحمد' })).toBeInTheDocument();
    expect(screen.getByText('البنسلين')).toBeInTheDocument();
    expect(screen.getByText('ارتفاع ضغط الدم')).toBeInTheDocument();
    const reports = screen.getByRole('region', { name: 'التقارير الطبية' });
    expect(
      within(reports)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringContaining('مراجعة'), expect.stringContaining('زيارة أولى')]);
    const prescriptions = screen.getByRole('region', { name: 'الوصفات' });
    expect(within(prescriptions).getByText('بانتظار الصرف')).toBeInTheDocument();
    expect(within(prescriptions).getByText(/أملوديبين/)).toBeInTheDocument();
    expect(within(prescriptions).getByText(/لمدة 30 يوم/)).toBeInTheDocument();
  });

  it('says so when the file is not one of mine, with a way back', async () => {
    const router = renderApp('/doctor/patients/0199a3d2-6c55-7000-8000-0000000000ff');
    const user = userEvent.setup();

    expect(await screen.findByText('ما لقينا هالمريض بين مرضاك')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'رجوع لمرضاي' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/doctor/patients'));
  });
});
