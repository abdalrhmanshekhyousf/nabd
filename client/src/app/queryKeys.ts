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
  publicHospitals: (search: string) => ['public-hospitals', search] as const,
};
