/** A lab test's life (task 3.4). Match the Prisma enum. */
export const LAB_TEST_STATUSES = ['REQUESTED', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export type LabTestStatus = (typeof LAB_TEST_STATUSES)[number];

export const LAB_PRIORITIES = ['ROUTINE', 'URGENT'] as const;
export type LabPriority = (typeof LAB_PRIORITIES)[number];

/**
 * The tests a doctor can order, by section, the way a hospital lab lists them.
 * Codes are stored; each client names them in its language (labTests.codes.*).
 */
export const LAB_TEST_GROUPS = {
  HEMATOLOGY: ['CBC', 'ESR', 'BLOOD_GROUP'],
  CHEMISTRY: [
    'FBS',
    'RBS',
    'HBA1C',
    'UREA',
    'CREATININE',
    'ELECTROLYTES',
    'LFT',
    'LIPIDS',
    'URIC_ACID',
    'CALCIUM',
  ],
  COAGULATION: ['PT_INR', 'PTT'],
  CARDIAC: ['TROPONIN', 'CK_MB', 'CRP'],
  HORMONES: ['TSH', 'BHCG'],
  URINE_STOOL: ['URINALYSIS', 'URINE_CULTURE', 'STOOL'],
} as const;

export type LabTestGroup = keyof typeof LAB_TEST_GROUPS;
export type LabTestCode = (typeof LAB_TEST_GROUPS)[LabTestGroup][number];
export const LAB_TEST_CODES = Object.values(LAB_TEST_GROUPS).flat() as LabTestCode[];

/** One ordered test, as the patient's file and the lab board show it. */
export type LabTestView = {
  id: string;
  code: LabTestCode;
  priority: LabPriority;
  status: LabTestStatus;
  notes: string | null;
  doctorName: string;
  technicianName: string | null;
  result: string | null;
  hasResultFile: boolean;
  abnormal: boolean | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};
