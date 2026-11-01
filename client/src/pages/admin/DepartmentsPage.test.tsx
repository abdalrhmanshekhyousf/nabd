import { DEPARTMENT_CODES } from '@nabd/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import type { Department } from '@/components/departments/departmentDisplay';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { setLanguage } from '@/i18n';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { apiError, fakeApi } from '@/test/fakeApi';
import { renderApp } from '@/test/renderApp';

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

// A tiny in-memory departments API.
let departments: Department[];
let nextId = 1;
const add = (name: string, code: Department['code'] = null, roomCount = 0) =>
  departments.push({ id: `d${nextId++}`, name, code, roomCount, staffCount: 0 });

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
  departments = [];
  useSessionStore.setState({ status: 'authenticated', user: ADMIN });
  fake.respond((config) => {
    const body = config.data ? JSON.parse(config.data as string) : {};
    const id = config.url?.split('/')[2];
    const found = departments.find((d) => d.id === id);
    if (config.url === '/departments/defaults') {
      for (const code of DEPARTMENT_CODES)
        if (!departments.some((d) => d.code === code)) add(code, code);
      return { status: 200, data: { added: 12, departments } };
    }
    if (config.method === 'post') {
      if (departments.some((d) => d.name === body.name)) {
        return apiError(409, 'DEPARTMENT_EXISTS', 'في قسم بنفس الاسم بالمستشفى');
      }
      add(body.name);
      return { status: 201, data: { department: departments.at(-1) } };
    }
    if (config.method === 'patch' && found) {
      found.name = body.name;
      return { status: 200, data: { department: found } };
    }
    if (config.method === 'delete' && found) {
      if (found.roomCount > 0) {
        return apiError(409, 'DEPARTMENT_IN_USE', 'ما فيك تحذف قسم فيه غرف أو موظفين');
      }
      departments = departments.filter((d) => d !== found);
      return { status: 204 };
    }
    return { status: 200, data: { departments } };
  });
});

const cards = () =>
  within(screen.getByRole('list', { name: 'أقسام المستشفى' })).getAllByRole('listitem');

describe('DepartmentsPage', () => {
  it('starts empty and adds the twelve standard departments in one click', async () => {
    renderApp('/admin/departments');
    const user = userEvent.setup();

    expect(await screen.findByText('لسا ما في أقسام')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'إضافة الأقسام الافتراضية' }));

    await waitFor(() => expect(cards()).toHaveLength(12));
    expect(within(cards()[0]).getByText('الإسعاف')).toBeInTheDocument();
    expect(within(cards()[11]).getByText('الصيدلية')).toBeInTheDocument();
    // Nothing left to add, so the button goes away.
    expect(screen.queryByRole('button', { name: 'إضافة الأقسام الافتراضية' })).toBeNull();
  });

  it('shows standard departments in the user language', async () => {
    add('EMERGENCY', 'EMERGENCY');
    add('الأطفال');
    await setLanguage('en');
    renderApp('/admin/departments');

    expect(await screen.findByText('Emergency')).toBeInTheDocument();
    expect(screen.getByText('الأطفال')).toBeInTheDocument();
  });

  it('adds a custom department and explains a duplicate name next to the field', async () => {
    add('الأطفال');
    renderApp('/admin/departments');
    const user = userEvent.setup();
    await screen.findByText('الأطفال');

    await user.click(screen.getByRole('button', { name: 'قسم جديد' }));
    const dialog = await screen.findByRole('dialog', { name: 'إضافة قسم' });
    await user.type(within(dialog).getByLabelText(/اسم القسم/), 'الأطفال');
    await user.click(within(dialog).getByRole('button', { name: 'إضافة' }));
    expect(await within(dialog).findByText('في قسم بنفس الاسم بالمستشفى')).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText(/اسم القسم/));
    await user.type(within(dialog).getByLabelText(/اسم القسم/), 'الحروق');
    await user.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('الحروق')).toBeInTheDocument();
  });

  it('renames custom departments only', async () => {
    add('EMERGENCY', 'EMERGENCY');
    add('الأطفال');
    renderApp('/admin/departments');
    const user = userEvent.setup();
    await screen.findByText('الأطفال');

    expect(screen.queryByRole('button', { name: 'تعديل اسم الإسعاف' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'تعديل اسم الأطفال' }));
    const name = within(await screen.findByRole('dialog')).getByLabelText(/اسم القسم/);
    expect(name).toHaveValue('الأطفال');
    await user.clear(name);
    await user.type(name, 'طب الأطفال');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    expect(await screen.findByText('طب الأطفال')).toBeInTheDocument();
  });

  it('deletes after confirming, and keeps a department that still has rooms', async () => {
    add('الأطفال');
    add('الحروق', null, 3);
    renderApp('/admin/departments');
    const user = userEvent.setup();
    await screen.findByText('الأطفال');

    await user.click(screen.getByRole('button', { name: 'حذف الأطفال' }));
    let dialog = await screen.findByRole('dialog', { name: 'حذف قسم الأطفال؟' });
    await user.click(within(dialog).getByRole('button', { name: 'حذف الأطفال' }));
    await waitFor(() => expect(screen.queryByText('الأطفال')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'حذف الحروق' }));
    dialog = await screen.findByRole('dialog', { name: 'حذف قسم الحروق؟' });
    await user.click(within(dialog).getByRole('button', { name: 'حذف الحروق' }));
    expect(await screen.findByText('ما فيك تحذف قسم فيه غرف أو موظفين')).toBeInTheDocument();
    expect(screen.getByText('الحروق')).toBeInTheDocument();
  });
});
