import type { InvoiceView } from '@nabd/shared';
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
const invoice: InvoiceView = {
  id: 'i1',
  number: 3,
  status: 'ISSUED',
  total: 50000,
  paid: 0,
  issuedAt: new Date().toISOString(),
  issuedByName: 'رنا',
  patient: { id: 'p1', fullName: 'سارة', isAnonymous: false, phone: null },
  items: [],
  payments: [],
};
let owed: InvoiceView[];

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
  owed = [invoice];
  useSessionStore.setState({ status: 'authenticated', user: ACCOUNTANT });
  fake.respond((config) => {
    if (config.url === '/invoices/i1/payments') {
      const { amount } = JSON.parse(config.data as string);
      owed = [{ ...invoice, paid: Number(amount), status: 'PARTIALLY_PAID' }];
      return { status: 201, data: { invoice: owed[0] } };
    }
    if (config.url === '/invoices')
      return { status: 200, data: { invoices: config.params?.status === 'OWED' ? owed : [] } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('PaymentsPage (task 4.14)', () => {
  it('records part of a payment; the invoice shows what is still due', async () => {
    renderApp('/accounting/payments');
    const user = userEvent.setup();
    const item = await screen.findByRole('listitem', { name: 'فاتورة رقم 3' });
    await user.click(within(item).getByRole('button', { name: 'تسجيل دفعة' }));
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText('المبلغ');
    expect(amount).toHaveValue(50000);
    await user.clear(amount);
    await user.type(amount, '60000');
    await user.click(within(dialog).getByRole('button', { name: 'تسجيل الدفعة' }));
    expect(within(dialog).getByRole('alert')).toBeInTheDocument();
    await user.clear(amount);
    await user.type(amount, '20000');
    await user.click(within(dialog).getByRole('radio', { name: 'بطاقة' }));
    await user.click(within(dialog).getByRole('button', { name: 'تسجيل الدفعة' }));
    expect(await within(item).findByText('مدفوعة جزئياً')).toBeInTheDocument();
    const sent = JSON.parse(fake.calls.find((c) => c.method === 'post')!.data as string);
    expect(sent).toMatchObject({ amount: '20000', method: 'CARD' });
  });
});
