import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import type { OperatingRoom } from '@/components/operatingRooms/orStyles';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
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

let rooms: OperatingRoom[];
let seq = 1;
const room = (name: string, status: OperatingRoom['status'] = 'AVAILABLE'): OperatingRoom => ({
  id: `or${seq++}`,
  name,
  status,
  statusChangedAt: '2026-11-02T08:00:00Z',
});

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
  rooms = [];
  useSessionStore.setState({ status: 'authenticated', user: ADMIN });
  fake.respond((config) => {
    const body = config.data ? JSON.parse(config.data as string) : {};
    const [, , id, sub] = config.url!.split('/');
    const target = rooms.find((r) => r.id === id);
    if (config.method === 'post') {
      if (rooms.some((r) => r.name === body.name)) {
        return apiError(409, 'OPERATING_ROOM_EXISTS', 'في غرفة عمليات بنفس الاسم');
      }
      rooms.push(room(body.name));
      return { status: 201, data: {} };
    }
    if (config.method === 'patch' && target && sub === 'service') {
      target.status = body.outOfService ? 'OUT_OF_SERVICE' : 'AVAILABLE';
      return { status: 200, data: {} };
    }
    if (config.method === 'patch' && target) {
      target.name = body.name;
      return { status: 200, data: {} };
    }
    if (config.method === 'delete') {
      rooms = rooms.filter((r) => r.id !== id);
      return { status: 204 };
    }
    return { status: 200, data: { operatingRooms: rooms } };
  });
});

const list = () => screen.getByRole('list', { name: 'غرف العمليات' });

describe('OperatingRoomsPage', () => {
  it('adds a room with a suggested name and shows it as available', async () => {
    renderApp('/admin/operating-rooms');
    const user = userEvent.setup();

    expect(await screen.findByText('لسا ما في غرف عمليات')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'غرفة عمليات جديدة' }));
    const dialog = await screen.findByRole('dialog', { name: 'إضافة غرفة عمليات' });
    expect(within(dialog).getByLabelText(/اسم الغرفة/)).toHaveValue('غرفة العمليات 1');
    await user.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(within(list()).getByText('غرفة العمليات 1')).toBeInTheDocument());
    expect(within(list()).getByText('فارغة')).toBeInTheDocument();
    expect(screen.getByText('المتاحة: 1 من 1')).toBeInTheDocument();
  });

  it('suggests the next free number and explains a duplicate name', async () => {
    rooms = [room('غرفة العمليات 1'), room('غرفة العمليات 2')];
    renderApp('/admin/operating-rooms');
    const user = userEvent.setup();
    await screen.findByText('غرفة العمليات 2');

    await user.click(screen.getByRole('button', { name: 'غرفة عمليات جديدة' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText(/اسم الغرفة/);
    expect(name).toHaveValue('غرفة العمليات 3');

    await user.clear(name);
    await user.type(name, 'غرفة العمليات 1');
    await user.click(within(dialog).getByRole('button', { name: 'إضافة' }));
    expect(await within(dialog).findByText('في غرفة عمليات بنفس الاسم')).toBeInTheDocument();
  });

  it('takes an idle room out of service and back', async () => {
    rooms = [room('غرفة العمليات 1')];
    renderApp('/admin/operating-rooms');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'إخراج من الخدمة' }));
    expect(await within(list()).findByText('خارج الخدمة')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'إرجاع للخدمة' }));
    expect(await within(list()).findByText('فارغة')).toBeInTheDocument();
  });

  it('offers no changes while a room is in use', async () => {
    rooms = [room('غرفة العمليات 1', 'IN_SURGERY')];
    renderApp('/admin/operating-rooms');

    expect(await screen.findByText('قيد العملية')).toBeInTheDocument();
    expect(screen.getByText('الغرفة مشغولة هلق، فما فيك تغيّرها')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إخراج من الخدمة' })).toBeNull();
    expect(screen.queryByRole('button', { name: /حذف/ })).toBeNull();
  });

  it('renames and deletes after confirming', async () => {
    rooms = [room('A')];
    renderApp('/admin/operating-rooms');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'تعديل اسم A' }));
    const name = within(await screen.findByRole('dialog')).getByLabelText(/اسم الغرفة/);
    await user.clear(name);
    await user.type(name, 'B');
    await user.click(screen.getByRole('button', { name: 'حفظ' }));
    expect(await within(list()).findByText('B')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'حذف B' }));
    const dialog = await screen.findByRole('dialog', { name: 'حذف B؟' });
    await user.click(within(dialog).getByRole('button', { name: 'حذف B' }));
    expect(await screen.findByText('لسا ما في غرف عمليات')).toBeInTheDocument();
  });
});
