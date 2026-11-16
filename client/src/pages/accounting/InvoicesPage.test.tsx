import type { ChargeView, InvoiceView } from '@nabd/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
const SARA = { id: 'p1', fullName: 'سارة', isAnonymous: false, phone: null };
const charge = (id: string, kind: ChargeView['kind'], total: number): ChargeView => ({
  id,
  kind,
  description: kind === 'LAB_TEST' ? 'CBC' : 'د. سامي',
  quantity: 1,
  unitPrice: total,
  total,
  invoiceId: null,
  createdAt: new Date().toISOString(),
});
let open: ChargeView[];
let invoices: InvoiceView[];

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
  open = [charge('c-visit', 'VISIT', 50000), charge('c-lab', 'LAB_TEST', 25000)];
  invoices = [];
  useSessionStore.setState({ status: 'authenticated', user: ACCOUNTANT });
  fake.respond((config) => {
    if (config.url === '/invoices' && config.method === 'post') {
      const { itemIds } = JSON.parse(config.data as string);
      const items = open.filter((c) => itemIds.includes(c.id));
      open = open.filter((c) => !itemIds.includes(c.id));
      invoices = [
        {
          id: 'i1',
          number: 7,
          status: 'ISSUED',
          total: items.reduce((s, c) => s + c.total, 0),
          paid: 0,
          issuedAt: new Date().toISOString(),
          issuedByName: 'رنا',
          patient: SARA,
          items,
          payments: [],
        },
      ];
      return { status: 201, data: { invoice: invoices[0] } };
    }
    if (config.url === '/invoices/accounts')
      return {
        status: 200,
        data: { accounts: [{ patient: SARA, openTotal: 75000, openCount: 2 }] },
      };
    if (config.url === '/invoices/accounts/p1')
      return { status: 200, data: { patient: SARA, open, invoices } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('InvoicesPage (task 4.13)', () => {
  it('issues an invoice for the chosen open charges and prints it', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderApp('/accounting/invoices');
    const user = userEvent.setup();
    const accounts = await screen.findByRole('list', { name: 'حسابات المرضى' });
    await user.click(within(accounts).getByRole('button', { name: /سارة/ }));
    const openList = await screen.findByRole('region', { name: 'خدمات لسا ما انفوترت' });
    // Leave the lab test for later.
    await user.click(within(openList).getByRole('checkbox', { name: /تحليل/ }));
    await user.click(within(openList).getByRole('button', { name: 'إصدار فاتورة' }));
    const list = await screen.findByRole('region', { name: 'الفواتير' });
    expect(await within(list).findByText('فاتورة رقم 7')).toBeInTheDocument();
    const body = JSON.parse(fake.calls.find((c) => c.method === 'post')!.data as string);
    expect(body).toEqual({ patientId: 'p1', itemIds: ['c-visit'] });

    await user.click(within(list).getByRole('button', { name: 'طباعة / PDF' }));
    const sheet = await screen.findByTestId('invoice-sheet');
    expect(sheet).toHaveTextContent('مستشفى الأمل');
    expect(sheet).toHaveTextContent('فاتورة رقم 7');
    expect(sheet).toHaveTextContent('معاينة: د. سامي');
    await vi.waitFor(() => expect(print).toHaveBeenCalled());
    print.mockRestore();
  });
});
