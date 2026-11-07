import type { LabPriority } from './lab.js';
import type { RadiologyModality } from './schemas/staff.js';

/** An imaging study's life (task 3.6). Match the Prisma enum. */
export const IMAGING_STATUSES = ['REQUESTED', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export type ImagingStatus = (typeof IMAGING_STATUSES)[number];

/**
 * Common body parts per modality, offered as quick picks when ordering (keys
 * under imaging.parts.* in each language); the doctor may write any other.
 */
export const IMAGING_PARTS: Record<RadiologyModality, readonly string[]> = {
  XRAY: ['CHEST', 'ABDOMEN', 'CERVICAL_SPINE', 'LUMBAR_SPINE', 'PELVIS', 'SKULL', 'LIMB'],
  CT: ['HEAD', 'CHEST', 'ABDOMEN_PELVIS', 'SPINE'],
  MRI: ['BRAIN', 'SPINE', 'KNEE', 'SHOULDER'],
  ECHO: ['HEART', 'ABDOMEN', 'PELVIS', 'THYROID'],
  ENDOSCOPY: ['UPPER_GI', 'COLON'],
  PANORAMIC: ['TEETH'],
};

/** One ordered study, as the patient's file (and later the radiology board) show it. */
export type ImagingView = {
  id: string;
  modality: RadiologyModality;
  bodyPart: string;
  reason: string | null;
  priority: LabPriority;
  status: ImagingStatus;
  doctorName: string;
  radiologistName: string | null;
  report: string | null;
  imageCount: number;
  abnormal: boolean | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

/** A study on a radiologist's board (tasks 3.7, 3.8): the study, and whose it is. */
export type ImagingBoardItem = ImagingView & {
  patient: {
    id: string;
    fullName: string | null;
    isAnonymous: boolean;
    gender: 'MALE' | 'FEMALE' | null;
    dateOfBirth: string | null;
  };
  mine: boolean;
};
