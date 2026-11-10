import type { CleaningRequestView } from '@nabd/shared';
import type { TFunction } from 'i18next';

type Job = Pick<CleaningRequestView, 'place' | 'bed' | 'note'>;

/** Where to clean: a bed a patient left (task 3.17) in the reader's language, else the place written. */
export function cleaningPlace(job: Job, t: TFunction) {
  return job.bed ? t('cleaning.bedPlace', { room: job.bed.room, bed: job.bed.label }) : job.place;
}

/** A bed job's note is why the bed was left; other notes are the nurse's own words. */
export function cleaningNote(job: Job, t: TFunction) {
  if (job.bed && (job.note === 'DISCHARGED' || job.note === 'MOVED')) {
    return t(`beds.reasons.${job.note}`);
  }
  return job.note;
}
