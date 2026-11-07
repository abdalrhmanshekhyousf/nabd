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
  labTests: [],
  imaging: [],
  prescriptions: [
    {
      id: 'p1',
      doctorName: 'د. ريم العلي',
      status: 'PENDING',
      notes: 'بعد الأكل',
      createdAt: new Date().toISOString(),
      dispensedAt: null,
      dispensedByName: null,
      items: [
        {
          id: 'i1',
          drugName: 'أملوديبين',
          dose: '5 ملغ',
          frequency: 'مرة باليوم',
          durationDays: 30,
          instructions: null,
          dispensed: null,
        },
      ],
    },
  ],
};

let file: PatientFile;

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
  file = structuredClone(FILE);
  fake.respond((config) => {
    if (config.method === 'post' && config.url === `/doctors/me/patients/${SARA}/reports`) {
      const body = JSON.parse(config.data as string);
      const report = {
        id: `rep${file.reports.length + 1}`,
        doctorName: 'د. ريم العلي',
        createdAt: new Date().toISOString(),
        ...body,
      };
      file.reports.unshift(report);
      return { status: 201, data: { report } };
    }
    if (config.method === 'post' && config.url === `/doctors/me/patients/${SARA}/prescriptions`) {
      const body = JSON.parse(config.data as string);
      const prescription = {
        id: 'p2',
        doctorName: 'د. ريم العلي',
        status: 'PENDING' as const,
        createdAt: new Date().toISOString(),
        dispensedAt: null,
        dispensedByName: null,
        notes: body.notes || null,
        items: body.items.map((item: object, i: number) => ({
          id: `n${i}`,
          ...item,
          dispensed: null,
        })),
      };
      file.prescriptions.unshift(prescription);
      return { status: 201, data: { prescription } };
    }
    if (config.method === 'post' && config.url === `/doctors/me/patients/${SARA}/lab-tests`) {
      const body = JSON.parse(config.data as string);
      const tests = body.codes.map((code: string, i: number) => ({
        id: `lab${i}`,
        code,
        priority: body.priority,
        status: 'REQUESTED' as const,
        notes: body.notes || null,
        doctorName: 'د. ريم العلي',
        technicianName: null,
        result: null,
        hasResultFile: false,
        abnormal: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      }));
      file.labTests.unshift(...tests);
      return { status: 201, data: { tests } };
    }
    if (config.url === '/imaging/staffed')
      return { status: 200, data: { modalities: ['XRAY', 'ECHO'] } };
    if (config.method === 'post' && config.url === `/doctors/me/patients/${SARA}/imaging`) {
      const body = JSON.parse(config.data as string);
      const study = {
        id: 'img1',
        ...body,
        reason: body.reason || null,
        status: 'REQUESTED' as const,
        doctorName: 'د. ريم العلي',
        radiologistName: null,
        report: null,
        imageCount: 0,
        abnormal: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      };
      file.imaging.unshift(study);
      return { status: 201, data: { study } };
    }
    if (config.method === 'delete' && config.url === '/doctors/me/imaging/img1') {
      file.imaging[0].status = 'CANCELLED';
      return { status: 200, data: { study: file.imaging[0] } };
    }
    if (config.method === 'delete' && config.url?.startsWith('/doctors/me/lab-tests/')) {
      const id = config.url.split('/').pop();
      const test = file.labTests.find((t) => t.id === id)!;
      test.status = 'CANCELLED';
      return { status: 200, data: { test } };
    }
    if (config.url === '/doctors/me/patients') {
      const search = (config.params?.search as string | undefined) ?? '';
      return {
        status: 200,
        data: { patients: PATIENTS.filter((p) => (p.fullName ?? '').includes(search)) },
      };
    }
    if (config.url === `/doctors/me/patients/${SARA}`) return { status: 200, data: file };
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

describe('writing in the file', () => {
  const posted = (kind: string) =>
    JSON.parse(
      fake.calls.find((c) => c.method === 'post' && c.url?.endsWith(kind))!.data as string,
    );

  async function openFile() {
    const user = userEvent.setup();
    renderApp(`/doctor/patients/${SARA}`);
    await screen.findByRole('heading', { name: 'سارة الأحمد' });
    return user;
  }

  it('writes a report that shows at the top of the file', async () => {
    const user = await openFile();
    await user.click(screen.getByRole('button', { name: 'كتابة تقرير' }));
    const dialog = await screen.findByRole('dialog', { name: 'تقرير جديد لـسارة الأحمد' });

    await user.click(within(dialog).getByRole('button', { name: 'حفظ التقرير' }));
    expect(await within(dialog).findAllByText('هالحقل مطلوب')).toHaveLength(2);

    await user.type(within(dialog).getByLabelText(/عنوان التقرير/), 'مراجعة طارئة');
    await user.type(within(dialog).getByLabelText(/نص التقرير/), 'ألم بالصدر، تخطيط طبيعي.');
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التقرير' }));

    expect(await screen.findByText('انحفظ التقرير بملف سارة الأحمد')).toBeInTheDocument();
    expect(posted('/reports')).toEqual({
      title: 'مراجعة طارئة',
      diagnosis: null,
      content: 'ألم بالصدر، تخطيط طبيعي.',
    });
    const reports = screen.getByRole('region', { name: 'التقارير الطبية' });
    await waitFor(() =>
      expect(within(reports).getAllByRole('listitem')[0]).toHaveTextContent('مراجعة طارئة'),
    );
  });

  it('writes a prescription of several medicines, reminding of allergies', async () => {
    const user = await openFile();
    await user.click(screen.getByRole('button', { name: 'وصفة جديدة' }));
    const dialog = await screen.findByRole('dialog', { name: 'وصفة جديدة لـسارة الأحمد' });
    expect(within(dialog).getByRole('note')).toHaveTextContent('حساسية من البنسلين');

    await user.click(within(dialog).getByRole('button', { name: 'إضافة دواء' }));
    await user.click(within(dialog).getByRole('button', { name: 'إضافة دواء' }));
    await user.click(within(dialog).getByRole('button', { name: 'إزالة الدواء 3' }));
    await waitFor(() => expect(within(dialog).getAllByLabelText(/اسم الدواء/)).toHaveLength(2));

    const [firstName, secondName] = within(dialog).getAllByLabelText(/اسم الدواء/);
    const [firstDose, secondDose] = within(dialog).getAllByLabelText(/^الجرعة/);
    const [firstFrequency, secondFrequency] = within(dialog).getAllByLabelText(/كم مرة/);
    await user.type(firstName, 'أموكسيسيلين');
    await user.type(firstDose, '500 ملغ');
    await user.type(firstFrequency, 'كل 8 ساعات');
    await user.type(within(dialog).getAllByLabelText(/المدة بالأيام/)[0], '7');
    await user.type(secondName, 'باراسيتامول');
    await user.type(secondDose, '500 ملغ');
    await user.type(secondFrequency, 'عند الحاجة');
    await user.click(within(dialog).getByRole('button', { name: 'حفظ الوصفة' }));

    expect(await screen.findByText('انحفظت الوصفة وراحت للصيدلية')).toBeInTheDocument();
    expect(posted('/prescriptions')).toEqual({
      items: [
        {
          drugName: 'أموكسيسيلين',
          dose: '500 ملغ',
          frequency: 'كل 8 ساعات',
          durationDays: 7,
          instructions: null,
        },
        {
          drugName: 'باراسيتامول',
          dose: '500 ملغ',
          frequency: 'عند الحاجة',
          durationDays: null,
          instructions: null,
        },
      ],
      notes: null,
    });
    const prescriptions = screen.getByRole('region', { name: 'الوصفات' });
    expect(await within(prescriptions).findByText(/أموكسيسيلين/)).toBeInTheDocument();
  });

  it('orders urgent lab tests from the file, then withdraws one (task 3.4)', async () => {
    renderApp(`/doctor/patients/${SARA}`);
    const user = userEvent.setup();
    const labs = await screen.findByRole('region', { name: 'التحاليل' });
    expect(labs).toHaveTextContent('ما في تحاليل لسا.');

    await user.click(screen.getByRole('button', { name: 'طلب تحليل' }));
    const dialog = await screen.findByRole('dialog', { name: 'طلب تحاليل لـ سارة الأحمد' });
    await user.click(within(dialog).getByRole('button', { name: 'إرسال للمخبر' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'اختار تحليل واحد على الأقل',
    );

    await user.click(within(dialog).getByRole('button', { name: 'تعداد دم كامل CBC' }));
    await user.click(within(dialog).getByRole('button', { name: 'التروبونين' }));
    expect(within(dialog).getByRole('button', { name: 'التروبونين' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(dialog).toHaveTextContent('اخترت تحليلين');
    await user.click(within(dialog).getByRole('radio', { name: 'مستعجل' }));
    await user.type(within(dialog).getByLabelText(/ملاحظة للمخبر/), 'ألم صدري');
    await user.click(within(dialog).getByRole('button', { name: 'إرسال للمخبر' }));

    expect(await screen.findByText('انبعت تحليلين للمخبر')).toBeInTheDocument();
    const post = fake.calls.find((c) => c.url?.endsWith('/lab-tests'))!;
    expect(JSON.parse(post.data as string)).toEqual({
      codes: ['CBC', 'TROPONIN'],
      priority: 'URGENT',
      notes: 'ألم صدري',
    });
    const cbc = await within(labs).findByLabelText('تعداد دم كامل CBC');
    expect(cbc).toHaveTextContent('مستعجل');
    expect(cbc).toHaveTextContent('بانتظار المخبر');
    expect(cbc).toHaveTextContent('طلبه د. ريم العلي');

    await user.click(within(cbc).getByRole('button', { name: 'سحب الطلب' }));
    expect(await screen.findByText('انسحب طلب تعداد دم كامل CBC')).toBeInTheDocument();
    expect(await within(labs).findByText('منسحب')).toBeInTheDocument();
  });

  it('orders an urgent CT of the head with its question, then withdraws it (task 3.6)', async () => {
    renderApp(`/doctor/patients/${SARA}`);
    const user = userEvent.setup();
    const section = await screen.findByRole('region', { name: 'الأشعة' });
    expect(section).toHaveTextContent('ما في طلبات أشعة لسا.');

    await user.click(screen.getByRole('button', { name: 'طلب أشعة' }));
    const dialog = await screen.findByRole('dialog', { name: 'طلب أشعة لـ سارة الأحمد' });
    await user.click(within(dialog).getByRole('button', { name: 'إرسال للأشعة' }));
    expect(await within(dialog).findByText('هالحقل مطلوب')).toBeInTheDocument();

    expect(within(dialog).queryByRole('status')).toBeNull();
    await user.click(within(dialog).getByRole('radio', { name: /طبقي محوري/ }));
    // Nobody does CT right now: said, but ordering is still allowed (task 3.7).
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'ما في فني طبقي محوري بالمستشفى هلق',
    );
    // The suggestions follow the type.
    expect(within(dialog).queryByRole('button', { name: 'صدر' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'ركبة' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'رأس' }));
    expect(within(dialog).getByLabelText(/المنطقة/)).toHaveValue('رأس');
    await user.type(within(dialog).getByLabelText(/السؤال السريري/), 'صداع بعد سقوط');
    await user.click(within(dialog).getByRole('radio', { name: 'مستعجل' }));
    await user.click(within(dialog).getByRole('button', { name: 'إرسال للأشعة' }));

    expect(await screen.findByText('انبعت طلب طبقي محوري · رأس للأشعة')).toBeInTheDocument();
    const post = fake.calls.find((c) => c.url?.endsWith('/imaging'))!;
    expect(JSON.parse(post.data as string)).toEqual({
      modality: 'CT',
      bodyPart: 'رأس',
      reason: 'صداع بعد سقوط',
      priority: 'URGENT',
    });
    const row = await within(section).findByLabelText('طبقي محوري · رأس');
    expect(row).toHaveTextContent('مستعجل');
    expect(row).toHaveTextContent('بانتظار الأشعة');
    expect(row).toHaveTextContent('صداع بعد سقوط');

    await user.click(within(row).getByRole('button', { name: 'سحب الطلب' }));
    expect(await screen.findByText('انسحب طلب طبقي محوري · رأس')).toBeInTheDocument();
    expect(await within(section).findByText('منسحب')).toBeInTheDocument();
  });
});
