import type { PatientSummary } from '@nabd/shared';
import { cn } from '@/lib/cn';

type Who = Pick<PatientSummary, 'fullName' | 'isAnonymous'>;

/** A round initial standing in for a photo. */
export function PatientAvatar({ patient, className }: { patient: Who; className?: string }) {
  const initial =
    patient.isAnonymous || !patient.fullName ? '?' : patient.fullName.trim().charAt(0);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-base font-bold text-accent',
        className,
      )}
    >
      {initial}
    </span>
  );
}
