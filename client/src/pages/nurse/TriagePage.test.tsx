import type { ErVisit } from '@nabd/shared';
import { fireEvent, screen, within } from '@testing-library/react';
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
