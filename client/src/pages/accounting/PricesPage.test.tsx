import { DEFAULT_PRICES, type ServicePriceView } from '@nabd/shared';
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

const ACCOUNTANT: SessionUser = {
  id: 'c1',
  email: 'acc@amal.org',
  fullName: 'رنا',
  role: 'ACCOUNTANT',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};
let prices: ServicePriceView[];

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
  prices = [];
  useSessionStore.setState({ status: 'authenticated', user: ACCOUNTANT });
  fake.respond((config) => {
    if (config.url === '/prices' && config.method === 'put') {
      const body = JSON.parse(config.data as string);
      prices = [...prices, { id: `p${prices.length}`, ...body, price: Number(body.price) }];
      return { status: 200, data: { price: prices.at(-1) } };
    }
    if (config.url === '/prices')
      return { status: 200, data: { prices, defaults: DEFAULT_PRICES } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('PricesPage (task 4.12)', () => {
  it('sets a usual price and an own price for one test', async () => {
    renderApp('/accounting/prices');
    const user = userEvent.setup();
    const lab = await screen.findByRole('region', { name: 'التحاليل' });
    const base = within(lab).getByLabelText('السعر العادي');
    expect(base).toHaveValue(DEFAULT_PRICES.LAB_TEST);
    await user.clear(base);
    await user.type(base, '30000');
    await user.click(within(lab).getByRole('button', { name: 'حفظ سعر التحاليل' }));
    await user.selectOptions(within(lab).getByLabelText('سعر خاص لـ'), 'CBC');
    await user.type(within(lab).getByLabelText('السعر'), '12000');
    await user.click(within(lab).getByRole('button', { name: 'إضافة سعر خاص بـ التحاليل' }));
    expect(await within(lab).findByRole('button', { name: /شيل سعر/ })).toBeInTheDocument();
    const puts = fake.calls
      .filter((c) => c.method === 'put')
      .map((c) => JSON.parse(c.data as string));
    expect(puts).toEqual([
      { kind: 'LAB_TEST', code: '', name: 'التحاليل', price: '30000' },
      { kind: 'LAB_TEST', code: 'CBC', name: expect.any(String), price: '12000' },
    ]);
  });
});
