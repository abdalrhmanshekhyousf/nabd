import type { PatientFile } from '@nabd/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { apiError, fakeApi } from '@/test/fakeApi';
import { renderApp } from '@/test/renderApp';

const fake = fakeApi(api);

const PATIENT: SessionUser = {
  id: 'u1',
  email: 'sara@mail.com',
  fullName: 'سارة',
  role: 'PATIENT',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const FILE: PatientFile = {
  patient: {
    patientId: 'p1',
    fullName: 'سارة الأحمد',
    isAnonymous: false,
    gender: 'FEMALE',
    dateOfBirth: null,
    phone: null,
    bloodType: 'A+',
    nationalId: null,
    address: null,
  },
  record: {
    id: 'r1',
    doctorName: 'د. سامي',
    allergies: 'البنسلين',
    chronicConditions: null,
    notes: null,
  },
  reports: [
    {
      id: 'rep1',
      doctorName: 'د. سامي',
      title: 'مراجعة',
      diagnosis: 'ضغط',
      content: 'الضغط مضبوط',
      createdAt: new Date().toISOString(),
    },
  ],
  prescriptions: [],
  labTests: [
    {
      id: 'l1',
      code: 'CBC',
      priority: 'ROUTINE',
      status: 'REQUESTED',
      notes: null,
      doctorName: 'د. سامي',
      technicianName: null,
      result: null,
      abnormal: false,
      hasResultFile: false,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    },
  ] as PatientFile['labTests'],
  imaging: [],
  consultations: [],
};

let hasFile = true;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  queryClient.clear();
  hasFile = true;
  useSessionStore.setState({ status: 'authenticated', user: PATIENT });
  fake.respond((config) => {
    if (config.url === '/patients/me/file') {
      return hasFile ? { status: 200, data: FILE } : apiError(404, 'NOT_FOUND');
    }
    if (config.url === '/appointments/mine') {
      return {
        status: 200,
        data: {
          upcoming: [
            {
              id: 'a1',
              doctorId: 'd1',
              doctorName: 'د. سامي',
              patientId: 'p1',
              startsAt: '2026-11-16T06:10:00.000Z',
              endsAt: '2026-11-16T06:30:00.000Z',
              status: 'BOOKED',
              reason: null,
              cancelReason: null,
              department: { id: 'c', name: 'Cardio', code: 'CARDIOLOGY' },
            },
          ],
          past: [],
        },
      };
    }
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('MedicalFilePage (task 3.23)', () => {
  it('shows my follow-ups and my whole file, read-only', async () => {
    renderApp('/patient/file');
    const followUps = await screen.findByRole('region', { name: 'مواعيد المتابعة' });
    expect(await within(followUps).findByText(/9:10/)).toBeInTheDocument();
    expect(followUps).toHaveTextContent('د. سامي');
    expect(screen.getByRole('heading', { name: 'سارة الأحمد' })).toBeInTheDocument();
    expect(screen.getByText('البنسلين')).toBeInTheDocument();
    expect(screen.getByText('الضغط مضبوط')).toBeInTheDocument();
    // Nothing to write or withdraw.
    expect(screen.queryByRole('button', { name: 'كتابة تقرير' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'سحب الطلب' })).toBeNull();
  });

  it('says so when no file is linked yet', async () => {
    hasFile = false;
    renderApp('/patient/file');
    expect(await screen.findByText(/ما في ملف طبي مربوط بحسابك/)).toBeInTheDocument();
  });

  it('prints the file or saves it as PDF, with the hospital on top and Nabd below (task 3.24)', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderApp('/patient/file');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'طباعة / PDF' }));
    const sheet = await screen.findByTestId('file-sheet');
    expect(sheet).toHaveTextContent('مستشفى الأمل');
    expect(sheet).toHaveTextContent('الملف الطبي');
    expect(sheet).toHaveTextContent('سارة الأحمد');
    expect(sheet).toHaveTextContent('البنسلين');
    expect(sheet).toHaveTextContent('الضغط مضبوط');
    expect(sheet).toHaveTextContent('Powered by');
    expect(sheet).toHaveTextContent('Nabd');
    expect(document.body).toHaveClass('printing');
    await waitFor(() => expect(print).toHaveBeenCalled());
    window.dispatchEvent(new Event('afterprint'));
    await waitFor(() => expect(screen.queryByTestId('file-sheet')).toBeNull());
    expect(document.body).not.toHaveClass('printing');
    print.mockRestore();
  });
});
