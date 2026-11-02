import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import type { Department } from '@/components/departments/departmentDisplay';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { apiError, fakeApi } from '@/test/fakeApi';
import { renderApp } from '@/test/renderApp';
import type { StaffMember } from './StaffPage';

const fake = fakeApi(api);

const ADMIN: SessionUser = {
  id: 'u1',
  email: 'admin@nabd.demo',
  fullName: 'مدير المستشفى',
  role: 'ADMIN',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const CARDIOLOGY: Department = {
  id: '0199a3d2-6c55-7000-8000-000000000001',
  name: 'القلبية',
  code: 'CARDIOLOGY',
  roomCount: 0,
  staffCount: 0,
};

let staff: StaffMember[];

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
  staff = [];
  useSessionStore.setState({ status: 'authenticated', user: ADMIN });
  fake.respond((config) => {
    if (config.url === '/departments') return { status: 200, data: { departments: [CARDIOLOGY] } };
    if (config.url === '/staff' && config.method === 'post') {
      const body = JSON.parse(config.data as string);
      if (staff.some((member) => member.email === body.email)) {
        return apiError(409, 'EMAIL_TAKEN', 'في حساب بهالإيميل بالمستشفى');
      }
      staff.unshift({
        id: `s${staff.length + 1}`,
        isActive: true,
        department: body.departmentId ? CARDIOLOGY : null,
        ...body,
      });
      return { status: 201, data: { member: staff[0] } };
    }
    return { status: 200, data: { staff } };
  });
});

async function openDialog() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'إضافة موظف' }));
  const dialog = await screen.findByRole('dialog', { name: 'إضافة موظف جديد' });
  return { user, dialog };
}

const posted = () =>
  JSON.parse(fake.calls.find((c) => c.url === '/staff' && c.method === 'post')!.data as string);

describe('StaffPage', () => {
  it('asks a doctor for department and specialty, then shows the login details', async () => {
    renderApp('/admin/staff');
    expect(await screen.findByText('لسا ما في موظفين')).toBeInTheDocument();
    const { user, dialog } = await openDialog();

    await user.click(within(dialog).getByRole('button', { name: 'إضافة الموظف' }));
    expect(await within(dialog).findAllByText('هالحقل مطلوب')).not.toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/الاسم الكامل/), 'د. ريم العلي');
    await user.selectOptions(within(dialog).getByLabelText(/الدور/), 'DOCTOR');
    expect(await within(dialog).findByLabelText(/الاختصاص/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/الاختصاص/), 'قلبية');
    await user.selectOptions(within(dialog).getByLabelText(/^القسم/), CARDIOLOGY.id);
    await user.clear(within(dialog).getByLabelText(/الراتب/));
    await user.type(within(dialog).getByLabelText(/الراتب/), '1500000');
    await user.type(within(dialog).getByLabelText(/إيميل الدخول/), 'Reem@Amal.Org');
    await user.type(within(dialog).getByLabelText(/^كلمة السر/), 'Strong1234');
    await user.click(within(dialog).getByRole('button', { name: 'إضافة الموظف' }));

    const credentials = await screen.findByRole('dialog', { name: 'بيانات دخول د. ريم العلي' });
    expect(within(credentials).getByText('reem@amal.org')).toBeInTheDocument();
    expect(within(credentials).getByText('Strong1234')).toBeInTheDocument();
    expect(posted()).toEqual({
      fullName: 'د. ريم العلي',
      phone: null,
      role: 'DOCTOR',
      departmentId: CARDIOLOGY.id,
      specialty: 'قلبية',
      radiologyModality: null,
      salary: 1500000,
      email: 'reem@amal.org',
      password: 'Strong1234',
    });

    await user.click(within(credentials).getByRole('button', { name: 'تمام' }));
    const table = await screen.findByRole('table', { name: 'قائمة الموظفين' });
    expect(within(table).getByText('د. ريم العلي')).toBeInTheDocument();
  });

  it('asks a radiologist for the imaging type, and nobody else', async () => {
    renderApp('/admin/staff');
    const { user, dialog } = await openDialog();

    expect(within(dialog).queryByLabelText(/نوع التصوير/)).toBeNull();
    await user.selectOptions(within(dialog).getByLabelText(/الدور/), 'RADIOLOGIST');
    const modality = await within(dialog).findByLabelText(/نوع التصوير/);
    await user.selectOptions(modality, 'MRI');
    await user.selectOptions(within(dialog).getByLabelText(/الدور/), 'ACCOUNTANT');
    await waitFor(() => expect(within(dialog).queryByLabelText(/نوع التصوير/)).toBeNull());
  });

  it('generates a strong password and shows it', async () => {
    renderApp('/admin/staff');
    const { user, dialog } = await openDialog();

    await user.click(within(dialog).getByRole('button', { name: 'توليد كلمة سر قوية' }));

    const password = within(dialog).getByLabelText(/^كلمة السر/) as HTMLInputElement;
    expect(password.type).toBe('text');
    expect(password.value).toMatch(/^(?=.*[a-zA-Z])(?=.*\d).{12}$/);
  });

  it('explains an email that is already used, next to the email', async () => {
    staff = [
      {
        id: 's1',
        fullName: 'لينا',
        email: 'lina@amal.org',
        phone: null,
        role: 'NURSE',
        isActive: true,
        department: CARDIOLOGY,
        salary: 0,
        radiologyModality: null,
        specialty: null,
      },
    ];
    renderApp('/admin/staff');
    const { user, dialog } = await openDialog();

    await user.type(within(dialog).getByLabelText(/الاسم الكامل/), 'وسيم');
    await user.selectOptions(within(dialog).getByLabelText(/الدور/), 'ACCOUNTANT');
    await user.type(within(dialog).getByLabelText(/إيميل الدخول/), 'lina@amal.org');
    await user.type(within(dialog).getByLabelText(/^كلمة السر/), 'Strong1234');
    await user.click(within(dialog).getByRole('button', { name: 'إضافة الموظف' }));

    expect(await within(dialog).findByText('في حساب بهالإيميل بالمستشفى')).toBeInTheDocument();
  });
});
