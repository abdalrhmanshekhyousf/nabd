import type { InventoryItemView, StockMovementView } from '@nabd/shared';
import { screen, waitFor, within } from '@testing-library/react';
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

const PHARMACIST: SessionUser = {
  id: 'p1',
  email: 'rami@amal.org',
  fullName: 'رامي العطار',
  role: 'PHARMACIST',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

function item(id: string, name: string, quantity: number, minQuantity: number, unit = 'علبة') {
  return {
    id,
    category: 'DRUG',
    name,
    unit,
    quantity,
    minQuantity,
    notes: null,
    low: quantity <= minQuantity,
    updatedAt: new Date().toISOString(),
  } satisfies InventoryItemView;
}

let items: InventoryItemView[];
const LOG: StockMovementView[] = [
  {
    id: 'm2',
    kind: 'USE',
    change: -40,
    quantityAfter: 200,
    reason: 'الإسعاف',
    byName: 'رامي العطار',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'm1',
    kind: 'RESTOCK',
    change: 240,
    quantityAfter: 240,
    reason: null,
    byName: 'رامي العطار',
    createdAt: new Date().toISOString(),
  },
];

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
  items = [
    item('i1', 'سيروم ملحي 0.9% 500 مل', 200, 80, 'كيس'),
    item('i2', 'سيفترياكسون 1 غ فيال', 12, 40, 'فيال'),
    item('i3', 'كانيولا وريدية 24G أصفر', 0, 80, 'قطعة'),
  ];
  useSessionStore.setState({ status: 'authenticated', user: PHARMACIST });
  fake.respond((config) => {
    if (config.url === '/inventory' && config.method === 'get') {
      const search = (config.params as { search?: string }).search ?? '';
      return {
        status: 200,
        data: { category: 'DRUG', items: items.filter((i) => i.name.includes(search)) },
      };
    }
    if (config.url === '/inventory' && config.method === 'post') {
      const body = JSON.parse(config.data as string);
      const created = item('i4', body.name, body.quantity, body.minQuantity, body.unit);
      items = [...items, created];
      return { status: 201, data: { item: created } };
    }
    const move = config.url?.match(/^\/inventory\/(.+)\/movements$/);
    if (move && config.method === 'post') {
      const body = JSON.parse(config.data as string);
      const current = items.find((i) => i.id === move[1])!;
      const quantity =
        body.kind === 'ADJUST'
          ? body.counted
          : current.quantity + (body.kind === 'RESTOCK' ? body.amount : -body.amount);
      const updated = { ...current, quantity, low: quantity <= current.minQuantity };
      items = items.map((i) => (i.id === current.id ? updated : i));
      return {
        status: 201,
        data: { item: updated, becameLow: !current.low && updated.low },
      };
    }
    if (move) return { status: 200, data: { movements: LOG } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

const postOf = (url: string) =>
  JSON.parse(fake.calls.find((c) => c.url === url && c.method === 'post')!.data as string);

describe('InventoryPage', () => {
  it('lists the stock with its state, and filters what runs low', async () => {
    renderApp('/pharmacy/inventory');
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: 'مخزون الصيدلية' })).toBeInTheDocument();
    expect(await screen.findByText('3 مادة · 2 ناقصة')).toBeInTheDocument();
    expect(screen.getByLabelText('سيروم ملحي 0.9% 500 مل')).toHaveTextContent('200 كيسمتوفر');
    expect(screen.getByLabelText('سيفترياكسون 1 غ فيال')).toHaveTextContent('ناقص');
    expect(screen.getByLabelText('كانيولا وريدية 24G أصفر')).toHaveTextContent('نفد');

    await user.click(screen.getByRole('button', { name: 'الناقص بس (2)' }));
    expect(screen.queryByLabelText('سيروم ملحي 0.9% 500 مل')).toBeNull();
    expect(screen.getByLabelText('سيفترياكسون 1 غ فيال')).toBeInTheDocument();
  });

  it('searches on the server', async () => {
    renderApp('/pharmacy/inventory');
    const user = userEvent.setup();
    await screen.findByLabelText('سيروم ملحي 0.9% 500 مل');
    await user.type(screen.getByRole('searchbox', { name: 'دوّر على مادة' }), 'سيروم');
    await waitFor(() => expect(screen.queryByLabelText('سيفترياكسون 1 غ فيال')).toBeNull());
    expect(fake.calls.some((c) => (c.params as { search?: string })?.search === 'سيروم')).toBe(
      true,
    );
  });

  it('receives stock typed in Arabic digits, showing what it will be', async () => {
    renderApp('/pharmacy/inventory');
    const user = userEvent.setup();
    const row = await screen.findByLabelText('سيفترياكسون 1 غ فيال');
    await user.click(within(row).getByRole('button', { name: 'توريد' }));
    const dialog = await screen.findByRole('dialog', { name: 'سيفترياكسون 1 غ فيال' });
    expect(dialog).toHaveTextContent('الموجود هلق: 12 فيال');
    await user.type(within(dialog).getByLabelText(/الكمية/), '١٠٠');
    expect(dialog).toHaveTextContent('رح يصير الموجود: 112 فيال');
    await user.click(within(dialog).getByRole('button', { name: 'تسجيل التوريد' }));

    expect(
      await screen.findByText('انضاف لـ سيفترياكسون 1 غ فيال، صار الموجود 112'),
    ).toBeInTheDocument();
    expect(postOf('/inventory/i2/movements')).toEqual({ kind: 'RESTOCK', amount: 100, reason: '' });
    expect(await screen.findByLabelText('سيفترياكسون 1 غ فيال')).toHaveTextContent('متوفر');
  });

  it('will not use more than there is, and a count needs a reason', async () => {
    renderApp('/pharmacy/inventory');
    const user = userEvent.setup();
    const row = await screen.findByLabelText('سيروم ملحي 0.9% 500 مل');
    await user.click(within(row).getByRole('button', { name: 'صرف' }));
    const dialog = await screen.findByRole('dialog', { name: 'سيروم ملحي 0.9% 500 مل' });
    await user.type(within(dialog).getByLabelText(/الكمية/), '250');
    await user.click(within(dialog).getByRole('button', { name: 'تسجيل الصرف' }));
    expect(await within(dialog).findByText('الموجود 200 كيس بس')).toBeInTheDocument();
    expect(fake.calls.some((c) => c.method === 'post')).toBe(false);

    await user.click(within(dialog).getByRole('radio', { name: 'جرد' }));
    const counted = within(dialog).getByLabelText(/العدد الفعلي/);
    await user.clear(counted);
    await user.type(counted, '70');
    await user.click(within(dialog).getByRole('button', { name: 'تثبيت الجرد' }));
    expect(await within(dialog).findByText('هالحقل مطلوب')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/سبب الجرد/), 'جرد آخر الشهر');
    await user.click(within(dialog).getByRole('button', { name: 'تثبيت الجرد' }));

    expect(
      await screen.findByText('سيروم ملحي 0.9% 500 مل وصلت للحد الأدنى، لازم تطلب منها'),
    ).toBeInTheDocument();
    expect(postOf('/inventory/i1/movements')).toEqual({
      kind: 'ADJUST',
      counted: 70,
      reason: 'جرد آخر الشهر',
    });
  });

  it('adds an item and shows an item’s movement log', async () => {
    renderApp('/pharmacy/inventory');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'إضافة مادة' }));
    const dialog = await screen.findByRole('dialog', { name: 'إضافة مادة للمخزون' });
    await user.click(within(dialog).getByRole('button', { name: 'إضافة' }));
    expect((await within(dialog).findAllByText('هالحقل مطلوب')).length).toBeGreaterThan(0);
    await user.type(within(dialog).getByLabelText(/اسم المادة/), 'سيتيريزين شراب');
    await user.type(within(dialog).getByLabelText(/الوحدة/), 'عبوة');
    await user.type(within(dialog).getByLabelText(/الكمية الموجودة/), '24');
    await user.type(within(dialog).getByLabelText(/الحد الأدنى/), '10');
    await user.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    expect(await screen.findByText('انضافت سيتيريزين شراب للمخزون')).toBeInTheDocument();
    expect(postOf('/inventory')).toEqual({
      name: 'سيتيريزين شراب',
      unit: 'عبوة',
      quantity: 24,
      minQuantity: 10,
      notes: '',
    });

    const saline = await screen.findByLabelText('سيروم ملحي 0.9% 500 مل');
    await user.click(within(saline).getByRole('button', { name: 'سجل الحركات' }));
    const log = await screen.findByRole('dialog', { name: 'سجل سيروم ملحي 0.9% 500 مل' });
    expect(await within(log).findByText('-40')).toBeInTheDocument();
    expect(log).toHaveTextContent('صرف · الإسعاف');
    expect(log).toHaveTextContent('+240');
    expect(log).toHaveTextContent('بقي 200');
  });
});
