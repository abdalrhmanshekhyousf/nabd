// TanStack Query cache keys, in one place so pages and mutations agree.
export const queryKeys = {
  hospital: ['hospital'] as const,
  departments: ['departments'] as const,
  rooms: (departmentId: string) => ['rooms', departmentId] as const,
  operatingRooms: ['operating-rooms'] as const,
  staff: (filter: object = {}) => ['staff', filter] as const,
  assignments: ['assignments'] as const,
  notifications: ['notifications'] as const,
  doctorStatus: ['doctor-status'] as const,
  myPatients: (search = '') => ['my-patients', search] as const,
  patientFile: (patientId: string) => ['patient-file', patientId] as const,
  erAccess: ['er-access'] as const,
  erQueue: ['er-queue'] as const,
  erVisit: (id: string) => ['er-visit', id] as const,
  doctors: ['doctors'] as const,
  doctorCalls: ['doctor-calls'] as const,
  bookingsDay: (day: string) => ['bookings', 'day', day] as const,
  myBookings: ['bookings', 'mine'] as const,
  /** The next hours of every room, for an emergency booking (task 2.21). */
  bookingsAhead: ['bookings', 'ahead'] as const,
  /** Under operating-rooms, so every room or booking change refreshes it (task 2.22). */
  orBoard: ['operating-rooms', 'board'] as const,
  /** The live board (task 2.26), refreshed with the rooms. */
  orLive: ['operating-rooms', 'live'] as const,
  /** The cleaner's jobs (task 2.24); the server refreshes this key. */
  cleaningRequests: ['cleaning-requests'] as const,
  /** A nurse's department requests (task 2.25), refreshed with the cleaners' key. */
  departmentCleaning: ['cleaning-requests', 'department'] as const,
  /** Stock lists (task 3.2), refreshed when any stock moves. */
  inventory: (scope: string, search: string) => ['inventory', scope, search] as const,
  inventoryLog: (itemId: string) => ['inventory', 'log', itemId] as const,
  /** The lab board (task 3.5); the server refreshes this key. */
  labBoard: ['lab-tests'] as const,
  /** The pharmacy's board (task 3.10); the server refreshes ['prescriptions']. */
  pharmacy: ['prescriptions'] as const,
  /** Radiology (tasks 3.7, 3.8); the server refreshes ['imaging'] for each type's radiologists. */
  imagingBoard: ['imaging', 'board'] as const,
  imagingStaffed: ['imaging', 'staffed'] as const,
  /** Department reports (task 3.11); the server refreshes ['reports']. */
  reports: ['reports'] as const,
  reportPreview: (from: string, to: string) => ['reports', 'preview', from, to] as const,
  report: (id: string) => ['reports', 'one', id] as const,
  /** The doctor's consultations (task 3.12); the server refreshes ['consultations']. */
  consultations: ['consultations'] as const,
  colleagues: ['doctors', 'colleagues'] as const,
  /** Under consultations, so a withdrawn or answered question closes it live (task 3.13). */
  consultationFile: (id: string) => ['consultations', 'file', id] as const,
  /** A bed's history (task 3.15), under rooms so bed changes refresh it. */
  bedHistory: (bedId: string) => ['rooms', 'bed-history', bedId] as const,
  /** The ward nurse's beds (task 3.16); the server refreshes ['ward'] for the department. */
  ward: ['ward'] as const,
  wardCandidates: (search: string) => ['ward', 'candidates', search] as const,
  /** The live bed map (task 3.18), under rooms: every bed change refreshes it. */
  bedMap: ['rooms', 'map'] as const,
  /** The doctor's working week (task 3.19). */
  mySchedule: ['schedule', 'mine'] as const,
  publicHospitals: (search: string) => ['public-hospitals', search] as const,
};
