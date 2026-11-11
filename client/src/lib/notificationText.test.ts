import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { describeNotification } from './notificationText';

describe('notification sentences', () => {
  it('a visit reminder names the doctor and the time in hospital time (task 3.27)', async () => {
    await i18n.changeLanguage('ar');
    const { title, body } = describeNotification({
      type: 'FOLLOW_UP_REMINDER',
      // 16:20 in Damascus.
      data: { doctor: 'د. سامي', startsAt: '2026-11-16T13:20:00.000Z', kind: 'DAY' },
    });
    expect(title).toBe('تذكير بموعد المراجعة');
    expect(body).toContain('مع د. سامي');
    expect(body).toContain('4:20');
  });

  it('a medication reminder says the medicine, the dose and the time (task 3.26)', async () => {
    await i18n.changeLanguage('en');
    const { body } = describeNotification({
      type: 'MEDICATION_REMINDER',
      data: { drug: 'Amlodipine', dose: '5 mg', time: '08:00' },
    });
    expect(body).toBe('Amlodipine · 5 mg · at 08:00');
    await i18n.changeLanguage('ar');
  });
});
