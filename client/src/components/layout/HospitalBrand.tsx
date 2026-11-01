import type { SessionHospital } from '@/app/session';
import { initials } from '@/lib/initials';

// The hospital's own logo (uploaded by the admin in task 1.23), or a calm tile
// with its initials until then.
export function HospitalBrand({ hospital }: { hospital: SessionHospital }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {hospital.logoUrl ? (
        <img
          src={hospital.logoUrl}
          alt=""
          className="size-10 shrink-0 rounded-xl bg-surface object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-sm font-bold text-accent"
        >
          {initials(hospital.name)}
        </span>
      )}
      <span className="truncate text-sm leading-tight font-semibold text-foreground">
        {hospital.name}
      </span>
    </div>
  );
}
