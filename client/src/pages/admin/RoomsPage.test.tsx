import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import type { Department } from '@/components/departments/departmentDisplay';
import type { Room } from '@/components/rooms/bedStyles';
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

// In-memory departments, rooms and beds.
let departments: Department[];
let rooms: Room[];
let seq = 1;
const bed = (label: string, status: Room['beds'][number]['status'] = 'EMPTY') => ({
  id: `b${seq++}`,
  label,
  status,
  statusChangedAt: '2026-11-02T00:00:00Z',
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
  useSessionStore.setState({ status: 'authenticated', user: ADMIN });
  departments = [
    { id: 'd1', name: 'الإسعاف', code: 'EMERGENCY', roomCount: 0, staffCount: 0 },
    { id: 'd2', name: 'الأطفال', code: null, roomCount: 0, staffCount: 0 },
  ];
  rooms = [];
  fake.respond((config) => {
    const body = config.data ? JSON.parse(config.data as string) : {};
    const [, resource, id, sub] = config.url!.split('/');
    const sync = () =>
      departments.forEach(
        (d) => (d.roomCount = rooms.filter((r) => r.departmentId === d.id).length),
      );
    if (resource === 'departments') return { status: 200, data: { departments } };
    if (resource === 'rooms' && config.method === 'get') {
      return {
        status: 200,
        data: { rooms: rooms.filter((r) => r.departmentId === config.params?.departmentId) },
      };
    }
    if (resource === 'rooms' && config.method === 'post' && !id) {
      if (rooms.some((r) => r.departmentId === body.departmentId && r.number === body.number)) {
        return apiError(409, 'ROOM_EXISTS', 'في غرفة بنفس الرقم بهالقسم');
      }
      const room: Room = {
        id: `r${seq++}`,
        number: body.number,
        floor: body.floor,
        departmentId: body.departmentId,
        beds: Array.from({ length: body.bedCount }, (_, i) => bed(String(i + 1))),
      };
      rooms.push(room);
      sync();
      return { status: 201, data: { room } };
    }
    const room = rooms.find((r) => r.id === id);
    if (resource === 'rooms' && sub === 'beds' && room) {
      room.beds.push(bed(String(room.beds.length + 1)));
      return { status: 201, data: { room } };
    }
    if (resource === 'rooms' && config.method === 'delete') {
      rooms = rooms.filter((r) => r.id !== id);
      sync();
      return { status: 204 };
    }
    if (resource === 'beds' && sub === 'history') {
      return {
        status: 200,
        data: {
          history: [
            {
              id: 'h1',
              fromStatus: 'CLEANING',
              toStatus: 'EMPTY',
              reason: null,
              changedByName: 'سعاد',
              createdAt: new Date().toISOString(),
              patientName: null,
            },
            {
              id: 'h2',
              fromStatus: 'OCCUPIED',
              toStatus: 'CLEANING',
              reason: 'خروج',
              changedByName: 'ريم',
              createdAt: new Date().toISOString(),
              patientName: 'سارة',
            },
          ],
        },
      };
    }
    const target = rooms.flatMap((r) => r.beds).find((b) => b.id === id);
    if (resource === 'beds' && target && config.method === 'patch') {
      target.status = body.outOfService ? 'OUT_OF_SERVICE' : 'EMPTY';
      return { status: 200, data: {} };
    }
    return { status: 200, data: {} };
  });
});

const roomList = () => screen.getByRole('list', { name: 'الغرف والأسرّة' });

async function addRoom(number: string, beds: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'غرفة جديدة' }));
  const dialog = await screen.findByRole('dialog', { name: 'إضافة غرفة' });
  await user.type(within(dialog).getByLabelText(/رقم الغرفة/), number);
  await user.clear(within(dialog).getByLabelText(/عدد الأسرّة/));
  await user.type(within(dialog).getByLabelText(/عدد الأسرّة/), beds);
  await user.click(within(dialog).getByRole('button', { name: 'إضافة' }));
  return { user, dialog };
}

describe('RoomsPage', () => {
  it('points to the departments page when there are none', async () => {
    departments = [];
    renderApp('/admin/rooms');
    expect(await screen.findByRole('link', { name: 'روح للأقسام' })).toHaveAttribute(
      'href',
      '/admin/departments',
    );
  });

  it('adds a room with its beds to the chosen department', async () => {
    renderApp('/admin/rooms');
    expect(await screen.findByText('لسا ما في غرف بهالقسم')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /الإسعاف/ })).toHaveAttribute('aria-pressed', 'true');

    await addRoom('101', '3');

    const card = await within(await waitFor(roomList)).findByText('غرفة 101');
    expect(card).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'سرير 3، فارغ' })).toBeInTheDocument();
    expect(
      JSON.parse(fake.calls.find((c) => c.url === '/rooms' && c.method === 'post')!.data as string),
    ).toEqual({
      departmentId: 'd1',
      number: '101',
      floor: null,
      bedCount: 3,
    });
  });

  it('switches department through the URL and shows only its rooms', async () => {
    rooms = [{ id: 'r1', number: '7', floor: null, departmentId: 'd2', beds: [] }];
    const router = renderApp('/admin/rooms');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /الأطفال/ }));

    await waitFor(() => expect(router.state.location.search).toBe('?department=d2'));
    expect(await screen.findByText('غرفة 7')).toBeInTheDocument();
  });

  it('explains a duplicate room number next to the field', async () => {
    rooms = [{ id: 'r1', number: '101', floor: null, departmentId: 'd1', beds: [] }];
    renderApp('/admin/rooms');
    await screen.findByText('غرفة 101');

    const { dialog } = await addRoom('101', '1');

    expect(await within(dialog).findByText('في غرفة بنفس الرقم بهالقسم')).toBeInTheDocument();
  });

  it('adds a bed and takes one out of service', async () => {
    rooms = [{ id: 'r1', number: '5', floor: 2, departmentId: 'd1', beds: [bed('1')] }];
    renderApp('/admin/rooms');
    const user = userEvent.setup();
    expect(await screen.findByText('الطابق 2 · الأسرّة: 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'إضافة سرير لغرفة 5' }));
    expect(await screen.findByRole('button', { name: 'سرير 2، فارغ' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'سرير 1، فارغ' }));
    const dialog = await screen.findByRole('dialog', { name: 'سرير 1 · غرفة 5' });
    await user.click(within(dialog).getByRole('button', { name: 'إخراج من الخدمة' }));

    expect(await screen.findByRole('button', { name: 'سرير 1، خارج الخدمة' })).toBeInTheDocument();
  });

  it('offers no changes for a bed with a patient', async () => {
    rooms = [
      { id: 'r1', number: '5', floor: null, departmentId: 'd1', beds: [bed('1', 'OCCUPIED')] },
    ];
    renderApp('/admin/rooms');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'سرير 1، مشغول' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText(/على هالسرير مريض أو محجوز/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'حذف السرير' })).toBeNull();
  });

  it('shows the bed history; a bed being cleaned cannot leave service (task 3.15)', async () => {
    rooms = [
      { id: 'r1', number: '5', floor: null, departmentId: 'd1', beds: [bed('1', 'CLEANING')] },
    ];
    renderApp('/admin/rooms');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'سرير 1، قيد التنظيف' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/عم ينضّف/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'إخراج من الخدمة' })).toBeNull();

    const history = await within(dialog).findByRole('region', { name: 'سجل السرير' });
    const lines = within(history).getAllByRole('listitem');
    expect(lines[0]).toHaveTextContent('سعاد');
    expect(lines[1]).toHaveTextContent('مشغول');
    expect(lines[1]).toHaveTextContent('ريم');
    expect(lines[1]).toHaveTextContent('سارة');
    expect(lines[1]).toHaveTextContent('خروج');
  });

  it('deletes a room after confirming', async () => {
    rooms = [{ id: 'r1', number: '5', floor: null, departmentId: 'd1', beds: [] }];
    renderApp('/admin/rooms');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'حذف غرفة 5' }));
    const dialog = await screen.findByRole('dialog', { name: 'حذف غرفة 5؟' });
    await user.click(within(dialog).getByRole('button', { name: 'حذف غرفة 5' }));

    expect(await screen.findByText('لسا ما في غرف بهالقسم')).toBeInTheDocument();
  });
});
