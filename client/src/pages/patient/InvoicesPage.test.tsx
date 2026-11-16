import type { ChargeView, InvoiceView } from '@nabd/shared';
import { screen, within } from '@testing-library/react';
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

const PATIENT: SessionUser = {
  id: 'u1',
  email: 'p@mail.com',
  fullName: 'سارة',
  role: 'PATIENT',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};
const line = (
  id: string,
  kind: ChargeView['kind'],
  total: number,
  invoiceId: string | null,
): ChargeView => ({
  id,
  kind,
  description: kind === 'LAB_TEST' ? 'CBC' : 'د. سامي',
  quantity: 1,
  unitPrice: total,
  total,
  invoiceId,
  createdAt: new Date().toISOString(),
});
const invoice: InvoiceView = {
  id: 'i1',
  number: 4,
  status: 'PARTIALLY_PAID',
  total: 50000,
  paid: 20000,
  issuedAt: new Date().toISOString(),
  issuedByName: 'رنا',
  patient: { id: 'p1', fullName: 'سارة', isAnonymous: false, phone: null },
  items: [line('a', 'VISIT', 50000, 'i1')],
  payments: [],
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
  useSessionStore.setState({ status: 'authenticated', user: PATIENT });
  fake.respond((config) => {
    if (config.url === '/patients/me/invoices')
      return {
        status: 200,
        data: { invoices: [invoice], open: [line('b', 'LAB_TEST', 25000, null)] },
      };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('MyInvoicesPage (task 4.15)', () => {
  it('shows each invoice with what is due, and the services not invoiced yet', async () => {
    renderApp('/patient/invoices');
    const item = await screen.findByRole('listitem', { name: 'فاتورة رقم 4' });
    expect(item).toHaveTextContent('مدفوعة جزئياً');
    expect(item).toHaveTextContent('معاينة: د. سامي');
    expect(item).toHaveTextContent('30,000 ل.س');
    expect(within(item).getByRole('button', { name: 'طباعة / PDF' })).toBeInTheDocument();
    const open = screen.getByRole('region', { name: 'خدمات لسا ما انفوترت' });
    expect(open).toHaveTextContent('تحليل');
  });
});
