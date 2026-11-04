import type { ErVisit } from '@nabd/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

const NURSE: SessionUser = {
  id: 'n1',
  email: 'lina@amal.org',
  fullName: 'لينا',
  role: 'NURSE',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const VISIT_ID = '0199a3d2-6c55-7000-8000-0000000000a1';
const VISIT: ErVisit = {
  id: VISIT_ID,
  status: 'WAITING',
  arrivedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  assessedAt: null,
  chiefComplaint: 'غياب وعي بعد حادث',
  arrivalNote: 'رجل حوالي 40، قميص أزرق',
  patient: { id: 'p1', fullName: null, isAnonymous: true, gender: 'MALE', dateOfBirth: null },
  breathing: null,
  consciousness: null,
  pulse: null,
  systolic: null,
  diastolic: null,
  respiratoryRate: null,
  oxygenSaturation: null,
  temperature: null,
  painScore: null,
  expectedExams: null,
  suggestedLevel: null,
  level: null,
  overrideReason: null,
  reasons: [],
  call: null,
  closedAt: null,
  closingNote: null,
  department: null,
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
  useSessionStore.setState({ status: 'authenticated', user: NURSE });
  fake.respond((config) => {
    if (config.url === `/er/visits/${VISIT_ID}`) return { status: 200, data: { visit: VISIT } };
    if (config.url === `/er/visits/${VISIT_ID}/triage`) {
      const body = JSON.parse(config.data as string);
      return {
        status: 200,
        data: { visit: { ...VISIT, ...body, assessedAt: new Date().toISOString() } },
      };
    }
    if (config.url?.startsWith('/er/visits/'))
      return apiError(404, 'NOT_FOUND', 'المطلوب غير موجود');
    if (config.url === '/notifications') {
      return { status: 200, data: { notifications: [], unread: 0 } };
    }
    return { status: 200, data: {} };
  });
});

describe('TriagePage', () => {
  it('shows who arrived, and asks for every required answer', async () => {
    renderApp(`/nurse/triage/${VISIT_ID}`);
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'مريض مجهول الهوية' })).toBeInTheDocument();
    expect(screen.getByText('رجل حوالي 40، قميص أزرق')).toBeInTheDocument();
    expect(screen.getByLabelText(/الشكوى الرئيسية/)).toHaveValue('غياب وعي بعد حادث');

    await user.click(screen.getByRole('button', { name: 'حفظ التقييم' }));

    expect(await screen.findAllByRole('alert')).toHaveLength(3);
    expect(fake.calls.some((c) => c.method === 'put')).toBe(false);
  });

  it('flags abnormal vital signs as they are typed and saves the assessment', async () => {
    renderApp(`/nurse/triage/${VISIT_ID}`);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'مريض مجهول الهوية' });

    const breathing = screen.getByRole('radiogroup', { name: 'عم يتنفس؟' });
    await user.click(within(breathing).getByRole('radio', { name: 'نعم' }));
    await user.click(screen.getByRole('radio', { name: /بيستجيب للصوت/ }));
    await user.type(screen.getByLabelText('النبض'), '118');
    expect(await screen.findByText('خارج الطبيعي (50–100)')).toBeInTheDocument();
    await user.type(screen.getByLabelText('نسبة الأكسجة'), '97');
    fireEvent.change(screen.getByRole('slider', { name: 'درجة الألم' }), {
      target: { value: '8' },
    });
    expect(screen.getByText('شديد')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'فحصين أو أكتر' }));
    await user.click(screen.getByRole('button', { name: 'حفظ التقييم' }));

    expect(await screen.findByText('انحفظ التقييم')).toBeInTheDocument();
    const put = fake.calls.find((c) => c.method === 'put')!;
    expect(JSON.parse(put.data as string)).toEqual({
      chiefComplaint: 'غياب وعي بعد حادث',
      breathing: true,
      consciousness: 'VERBAL',
      pulse: 118,
      systolic: null,
      diastolic: null,
      respiratoryRate: null,
      oxygenSaturation: 97,
      temperature: null,
      painScore: 8,
      expectedExams: 2,
    });
    expect(await screen.findByText(/آخر تقييم/)).toBeInTheDocument();
  });

  it('says so when the visit does not exist', async () => {
    renderApp('/nurse/triage/0199a3d2-6c55-7000-8000-0000000000ff');

    expect(await screen.findByText('ما لقينا هالزيارة')).toBeInTheDocument();
  });

  it('suggests the ESI level live as the form changes, with the reasons', async () => {
    renderApp(`/nurse/triage/${VISIT_ID}`);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'مريض مجهول الهوية' });
    const suggestion = screen.getByRole('region', { name: 'المستوى المقترح' });
    expect(suggestion).toHaveTextContent('المستوى 3');
    expect(suggestion).toHaveTextContent('كمّل التقييم ليصير الاقتراح أدق');

    const breathing = screen.getByRole('radiogroup', { name: 'عم يتنفس؟' });
    await user.click(within(breathing).getByRole('radio', { name: 'لا' }));
    expect(suggestion).toHaveTextContent('المستوى 1 · فوري');
    expect(suggestion).toHaveTextContent('ما عم يتنفس');

    await user.click(within(breathing).getByRole('radio', { name: 'نعم' }));
    await user.click(screen.getByRole('radio', { name: /^واعي/ }));
    await user.type(screen.getByLabelText('النبض'), '130');
    await user.type(screen.getByLabelText('نسبة الأكسجة'), '89');
    expect(suggestion).toHaveTextContent('المستوى 2 · خلال دقائق');
    expect(suggestion).toHaveTextContent('برّا الطبيعي: النبض، نسبة الأكسجة');

    await user.clear(screen.getByLabelText('النبض'));
    await user.clear(screen.getByLabelText('نسبة الأكسجة'));
    await user.click(screen.getByRole('radio', { name: 'فحص واحد' }));
    expect(suggestion).toHaveTextContent('المستوى 4 · بسيط');
    expect(suggestion).toHaveTextContent('بيحتاج فحص واحد');
  });
});

describe('setting another level (task 2.14)', () => {
  let current: ErVisit;

  beforeEach(() => {
    current = {
      ...VISIT,
      assessedAt: new Date().toISOString(),
      breathing: true,
      consciousness: 'ALERT',
      painScore: 2,
      expectedExams: 1,
      suggestedLevel: 4,
      level: 4,
      reasons: [{ code: 'EXAMS', count: 1 }],
    };
    fake.respond((config) => {
      if (config.url === `/er/visits/${VISIT_ID}`) return { status: 200, data: { visit: current } };
      if (config.url === `/er/visits/${VISIT_ID}/level`) {
        const { level, reason } = JSON.parse(config.data as string);
        current = {
          ...current,
          level,
          overrideReason: level === current.suggestedLevel ? null : reason,
        };
        return { status: 200, data: { visit: current } };
      }
      if (config.url === '/notifications') {
        return { status: 200, data: { notifications: [], unread: 0 } };
      }
      return { status: 200, data: {} };
    });
  });

  it('needs a reason for another level, shows the change, and goes back to the suggestion', async () => {
    renderApp(`/nurse/triage/${VISIT_ID}`);
    const user = userEvent.setup();
    expect(await screen.findByText('معتمد نفس المستوى المقترح (4)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'تعديل المستوى' }));
    const dialog = await screen.findByRole('dialog', { name: 'تعديل مستوى الخطورة' });
    await user.click(within(dialog).getByRole('radio', { name: /المستوى 2/ }));
    await user.click(within(dialog).getByRole('button', { name: 'اعتماد المستوى' }));
    expect(await within(dialog).findByText('اكتب ليش غيّرت المستوى')).toBeInTheDocument();
    expect(fake.calls.some((c) => c.url?.endsWith('/level'))).toBe(false);

    await user.type(within(dialog).getByLabelText(/سبب التعديل/), 'ألم صدر مع تعرّق');
    await user.click(within(dialog).getByRole('button', { name: 'اعتماد المستوى' }));

    expect(await screen.findByText('المستوى 2 بدل المقترح 4')).toBeInTheDocument();
    expect(screen.getByText('السبب: ألم صدر مع تعرّق')).toBeInTheDocument();
    const put = fake.calls.find((c) => c.url?.endsWith('/level'))!;
    expect(JSON.parse(put.data as string)).toEqual({ level: 2, reason: 'ألم صدر مع تعرّق' });

    await user.click(screen.getByRole('button', { name: 'رجوع للمقترح' }));
    expect(await screen.findByText('معتمد نفس المستوى المقترح (4)')).toBeInTheDocument();
    expect(
      JSON.parse(fake.calls.filter((c) => c.url?.endsWith('/level')).at(-1)!.data as string),
    ).toEqual({
      level: 4,
      reason: null,
    });
  });

  it('is not offered before the triage is saved', async () => {
    current = VISIT;
    renderApp(`/nurse/triage/${VISIT_ID}`);

    await screen.findByRole('heading', { name: 'مريض مجهول الهوية' });
    expect(screen.queryByRole('button', { name: 'تعديل المستوى' })).toBeNull();
  });
});

describe('calling a doctor (task 2.16)', () => {
  const doctor = (
    id: string,
    fullName: string,
    specialty: string,
    status: 'AVAILABLE' | 'BUSY' | 'ON_LEAVE',
  ) => ({
    id,
    fullName,
    specialty,
    status,
    department: null,
  });
  let current: ErVisit;
  let doctors: ReturnType<typeof doctor>[];

  beforeEach(() => {
    current = { ...VISIT, level: 2, suggestedLevel: 2, assessedAt: new Date().toISOString() };
    doctors = [
      doctor('reem', 'د. ريم', 'قلبية', 'BUSY'),
      doctor('sami', 'د. سامي', 'قلبية', 'AVAILABLE'),
      doctor('omar', 'د. عمر', 'عظمية', 'AVAILABLE'),
      doctor('lina', 'د. لينا', 'عصبية', 'ON_LEAVE'),
    ];
    fake.respond((config) => {
      if (config.url === `/er/visits/${VISIT_ID}`) return { status: 200, data: { visit: current } };
      if (config.url === '/er/doctors') return { status: 200, data: { doctors } };
      if (config.url === `/er/visits/${VISIT_ID}/calls` && config.method === 'post') {
        const { doctorId } = JSON.parse(config.data as string);
        const called = doctors.find((d) => d.id === doctorId)!;
        const call = {
          id: 'call1',
          status: 'PENDING' as const,
          doctorId,
          doctorName: called.fullName,
          declineReason: null,
          createdAt: new Date().toISOString(),
          respondedAt: null,
        };
        current = { ...current, call };
        return { status: 201, data: { call } };
      }
      if (config.url === `/er/visits/${VISIT_ID}/calls/call1` && config.method === 'delete') {
        current = { ...current, call: { ...current.call!, status: 'CANCELLED' } };
        return { status: 200, data: { call: current.call } };
      }
      if (config.url === '/notifications') {
        return { status: 200, data: { notifications: [], unread: 0 } };
      }
      return { status: 200, data: {} };
    });
  });

  it('suggests an available doctor of the same specialty when the chosen one is busy', async () => {
    renderApp(`/nurse/triage/${VISIT_ID}`);
    const user = userEvent.setup();
    const picker = await screen.findByRole('radiogroup', { name: 'استدعاء طبيب' });
    expect(within(picker).getByRole('radio', { name: /د. ريم/ })).toHaveTextContent('مشغول');

    await user.click(within(picker).getByRole('radio', { name: /د. ريم/ }));
    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent('د. ريم مشغول هلق.');
    expect(warning).toHaveTextContent('متفرّغين من نفس الاختصاص:');
    expect(within(warning).queryByRole('button', { name: 'استدعاء د. عمر' })).toBeNull();

    await user.click(within(warning).getByRole('button', { name: 'استدعاء د. سامي' }));

    expect(await screen.findByText('تم استدعاء د. سامي، وصله تنبيه عاجل')).toBeInTheDocument();
    const post = fake.calls.find((c) => c.method === 'post' && c.url?.endsWith('/calls'))!;
    expect(JSON.parse(post.data as string)).toEqual({ doctorId: 'sami' });
    expect(await screen.findByText('تم استدعاء د. سامي · بانتظار الرد')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'استدعاء طبيب' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'إلغاء الاستدعاء' }));
    expect(await screen.findByRole('radiogroup', { name: 'استدعاء طبيب' })).toBeInTheDocument();
    expect(fake.calls.some((c) => c.method === 'delete')).toBe(true);
  });

  it('offers available doctors of other specialties when nobody of the same one is free', async () => {
    renderApp(`/nurse/triage/${VISIT_ID}`);
    const user = userEvent.setup();
    const picker = await screen.findByRole('radiogroup', { name: 'استدعاء طبيب' });

    await user.click(within(picker).getByRole('radio', { name: /د. لينا/ }));

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent('د. لينا بعطلة هلق.');
    expect(warning).toHaveTextContent('ما في طبيب متفرّغ من نفس الاختصاص');
    expect(within(warning).getByRole('button', { name: 'استدعاء د. سامي' })).toBeInTheDocument();
    expect(within(warning).getByRole('button', { name: 'استدعاء د. عمر' })).toBeInTheDocument();
  });
});

describe('the patient leaves the ER (task 2.17)', () => {
  let current: ErVisit;

  beforeEach(() => {
    current = { ...VISIT, level: 3, suggestedLevel: 3, assessedAt: new Date().toISOString() };
    fake.respond((config) => {
      if (config.url === `/er/visits/${VISIT_ID}`) return { status: 200, data: { visit: current } };
      if (config.url === `/er/visits/${VISIT_ID}/status`) {
        current = { ...current, status: JSON.parse(config.data as string).status };
        return { status: 200, data: { visit: current } };
      }
      if (config.url === `/er/visits/${VISIT_ID}/transfer`) {
        const { note } = JSON.parse(config.data as string);
        current = {
          ...current,
          status: 'TRANSFERRED',
          closedAt: new Date().toISOString(),
          closingNote: note,
          department: { id: 'ward', name: 'القلبية', code: 'CARDIOLOGY' },
        };
        return { status: 200, data: { visit: current } };
      }
      if (config.url === `/er/visits/${VISIT_ID}/discharge`) {
        const { note } = JSON.parse(config.data as string);
        current = {
          ...current,
          status: 'DISCHARGED',
          closedAt: new Date().toISOString(),
          closingNote: note,
        };
        return { status: 200, data: { visit: current } };
      }
      if (config.url === '/departments') {
        return {
          status: 200,
          data: {
            departments: [
              { id: 'er', name: 'الإسعاف', code: 'EMERGENCY', roomCount: 0, staffCount: 0 },
              { id: 'ward', name: 'القلبية', code: 'CARDIOLOGY', roomCount: 0, staffCount: 0 },
            ],
          },
        };
      }
      if (config.url === '/er/queue') return { status: 200, data: { visits: [] } };
      if (config.url === '/notifications')
        return { status: 200, data: { notifications: [], unread: 0 } };
      return { status: 200, data: {} };
    });
  });

  it('switches between waiting and in treatment', async () => {
    renderApp(`/nurse/triage/${VISIT_ID}`);
    const user = userEvent.setup();
    const course = await screen.findByRole('radiogroup', { name: 'حالة المريض' });

    await user.click(within(course).getByRole('radio', { name: 'قيد العلاج' }));

    await waitFor(() =>
      expect(within(course).getByRole('radio', { name: 'قيد العلاج' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
    expect(JSON.parse(fake.calls.find((c) => c.url?.endsWith('/status'))!.data as string)).toEqual({
      status: 'IN_TREATMENT',
    });
  });

  it('transfers to a ward (never back to the ER) and returns to the list', async () => {
    const router = renderApp(`/nurse/triage/${VISIT_ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'تحويل لقسم' }));
    const dialog = await screen.findByRole('dialog', { name: 'تحويل لقسم' });

    await user.click(within(dialog).getByRole('button', { name: 'تحويل المريض' }));
    expect(await within(dialog).findByText('هالحقل مطلوب')).toBeInTheDocument();
    const select = within(dialog).getByLabelText(/^القسم/);
    expect(within(select).queryByRole('option', { name: 'الإسعاف' })).toBeNull();
    await user.selectOptions(select, 'ward');
    await user.type(within(dialog).getByLabelText(/ملاحظة للقسم/), 'مراقبة قلبية');
    await user.click(within(dialog).getByRole('button', { name: 'تحويل المريض' }));

    expect(await screen.findByText('تحوّل مريض مجهول الهوية لقسم القلبية')).toBeInTheDocument();
    expect(
      JSON.parse(fake.calls.find((c) => c.url?.endsWith('/transfer'))!.data as string),
    ).toEqual({
      departmentId: 'ward',
      note: 'مراقبة قلبية',
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/nurse/emergency'));
  });

  it('a closed visit says where the patient went and is read-only', async () => {
    current = {
      ...current,
      status: 'DISCHARGED',
      closedAt: new Date().toISOString(),
      closingNote: 'راحة 3 أيام',
    };
    renderApp(`/nurse/triage/${VISIT_ID}`);

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('تخرّج من الإسعاف');
    expect(banner).toHaveTextContent('راحة 3 أيام');
    expect(screen.getByRole('button', { name: 'حفظ التقييم' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'تعديل المستوى' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'استدعاء طبيب' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'تخريج' })).toBeNull();
  });

  it('discharges with instructions', async () => {
    renderApp(`/nurse/triage/${VISIT_ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'تخريج' }));
    const dialog = await screen.findByRole('dialog', { name: 'تخريج المريض' });

    await user.type(within(dialog).getByLabelText(/تعليمات التخريج/), 'راحة 3 أيام');
    await user.click(within(dialog).getByRole('button', { name: 'تخريج المريض' }));

    expect(await screen.findByText('تخرّج مريض مجهول الهوية')).toBeInTheDocument();
    expect(
      JSON.parse(fake.calls.find((c) => c.url?.endsWith('/discharge'))!.data as string),
    ).toMatchObject({
      note: 'راحة 3 أيام',
    });
  });
});
