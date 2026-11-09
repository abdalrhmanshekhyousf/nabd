import type { NotificationItem } from '@nabd/shared';
import i18n from '@/i18n';

/**
 * The sentence for a notification, in the reader's language (the server sends
 * only the type and its details). Types whose details are shown get a body.
 */
export function describeNotification({ type, data }: Pick<NotificationItem, 'type' | 'data'>) {
  const bodyKey = `notifications.body.${type}` as const;
  return {
    title: i18n.t(`notifications.types.${type}`),
    body: i18n.exists(bodyKey) ? i18n.t(bodyKey as never, readable(data)) : undefined,
  };
}

/** Details as the reader should see them: an unnamed patient, an unknown level. */
function readable(data: NotificationItem['data']) {
  return {
    ...data,
    patient: data.patient ?? i18n.t('patients.anonymous'),
    level: data.level ?? '—',
    complaint: data.complaint ?? '—',
    // A lab test is sent by its code; the reader sees its name (task 3.5).
    test: data.code ? i18n.t(`labTests.codes.${data.code}` as never) : '—',
    // An imaging study is sent by its type's code (task 3.8).
    modalityName: data.modality ? i18n.t(`modalities.${data.modality}` as never) : '—',
    // A department report is sent by its kind (task 3.11).
    reportName: data.kind ? i18n.t(`reports.kinds.${data.kind}` as never) : '—',
  };
}
