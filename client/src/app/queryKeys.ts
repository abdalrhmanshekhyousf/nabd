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
  publicHospitals: (search: string) => ['public-hospitals', search] as const,
};
