import type { DepartmentRequestContext, PurchaseView } from '@nabd/shared';
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

const PHARMACIST: SessionUser = {
  id: 'ph1',
  email: 'ph@amal.org',
  fullName: 'لينا',
  role: 'PHARMACIST',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};
const PHARMACY = { id: 'dep', name: 'الصيدلية', code: 'PHARMACY' as const };

let context: DepartmentRequestContext;
let purchases: PurchaseView[];

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
  purchases = [];
  context = {
    department: PHARMACY,
    head: { id: 'ph1', fullName: 'لينا', role: 'PHARMACIST' },
    isHead: true,
  };
  useSessionStore.setState({ status: 'authenticated', user: PHARMACIST });
  fake.respond((config) => {
    if (config.url === '/department-requests/context') return { status: 200, data: context };
    if (config.url === '/department-requests/shortages')
      return {
        status: 200,
        data: {
          items: [
            {
              id: '01a1e0b8-0000-7000-8000-000000000001',
              name: 'سيتامول',
              unit: 'علبة',
              quantity: 2,
              minQuantity: 10,
            },
          ],
        },
      };
    if (config.url === '/department-requests/purchases' && config.method === 'post') {
      const body = JSON.parse(config.data as string);
      purchases = [
        {
          id: 'p1',
          department: PHARMACY,
          requestedByName: 'لينا',
          note: null,
          totalCost: 45000,
          status: 'PENDING',
          decisionNote: null,
          decidedAt: null,
          createdAt: new Date().toISOString(),
          items: body.items.map((item: { name: string; quantity: string }, i: number) => ({
            id: `it${i}`,
            inventoryItemId: null,
            name: item.name,
            unit: 'علبة',
            quantity: Number(item.quantity),
            unitCost: 2500,
          })),
        },
      ];
      return { status: 201, data: { request: purchases[0] } };
    }
    if (config.url === '/department-requests')
      return { status: 200, data: { purchases, repairs: [] } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('DepartmentRequestsPage (task 4.6)', () => {
  it('the head adds what is short and sends a purchase request with its total', async () => {
    renderApp('/pharmacy/purchases');
    const user = userEvent.setup();
    const form = await screen.findByRole('form', { name: 'طلب شراء' });
    await user.click(await within(form).findByRole('button', { name: /سيتامول/ }));
    // Short by 2 of a minimum of 10: ask for 18 to be well stocked.
    expect(within(form).getByLabelText('الكمية')).toHaveValue(18);
    await user.type(within(form).getByLabelText('سعر الوحدة'), '2500');
    expect(form).toHaveTextContent('ل.س');
    await user.click(within(form).getByRole('button', { name: 'إرسال للمدير' }));

    const list = await screen.findByRole('region', { name: 'طلبات الشراء' });
    expect(await within(list).findByText('بانتظار القرار')).toBeInTheDocument();
    const post = fake.calls.find((c) => c.method === 'post')!;
    expect(JSON.parse(post.data as string).items).toEqual([
      {
        inventoryItemId: '01a1e0b8-0000-7000-8000-000000000001',
        name: 'سيتامول',
        unit: 'علبة',
        quantity: '18',
        unitCost: '2500',
      },
    ]);
  });

  it('others in the department are pointed to the head', async () => {
    context = {
      ...context,
      isHead: false,
      head: { id: 'x', fullName: 'سامي', role: 'PHARMACIST' },
    };
    renderApp('/pharmacy/purchases');
    expect(
      await screen.findByText(
        'طلبات القسم بتطلع من رئيس القسم سامي. إذا في شي ناقص أو معطّل بلّغه.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'طلب شراء' })).toBeNull();
  });
});
