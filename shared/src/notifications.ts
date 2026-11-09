/**
 * Every kind of live notification (task 2.2), from the notification table of
 * the project report. The server stores the type and its details; each
 * client writes the sentence in its own language.
 */
export const NOTIFICATION_TYPES = [
  'DOCTOR_CALL',
  'OPERATION_POSTPONED',
  'OPERATION_ENDED',
  'CLEANING_REQUEST',
  'BED_DISCHARGED',
  'LAB_RESULT',
  'IMAGING_RESULT',
  'CONSULTATION_REQUEST',
  'CONSULTATION_REPLY',
  'LOW_STOCK',
  'LEAVE_REQUEST',
  'PURCHASE_REQUEST',
  'REQUEST_DECIDED',
  'MEETING_REQUEST',
  'COMPLAINT',
  'MEDICATION_REMINDER',
  'FOLLOW_UP_REMINDER',
  'APPOINTMENT_CANCELLED',
  'REPORT_SUBMITTED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** These come with a sound and stay on screen until seen. */
export const URGENT_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'DOCTOR_CALL',
  'OPERATION_POSTPONED',
  'OPERATION_ENDED',
];

/** Details used to write the sentence, e.g. { patient: 'سارة', room: 'غرفة 1' }. */
export type NotificationData = Record<string, string | number | null>;

/** What the server sends on the `notification` event and lists for the bell. */
export type NotificationItem = {
  id: string;
  type: NotificationType;
  data: NotificationData;
  urgent: boolean;
  /** Where clicking it goes in the app, e.g. "/doctor/calls". */
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

/** Socket.io event names shared by server and client. */
export const REALTIME_EVENTS = {
  notification: 'notification',
  /** Data changed on the server: open screens showing it fetch it again (task 2.3). */
  refresh: 'refresh',
} as const;

/**
 * Payload of the refresh event: TanStack Query key prefixes to fetch again,
 * e.g. [['operating-rooms']] or [['rooms', departmentId]].
 */
export type RefreshPayload = { queryKeys: string[][] };
