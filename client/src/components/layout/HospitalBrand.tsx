import { AnimatePresence, motion } from 'framer-motion';
import type { SessionHospital } from '@/app/session';
import { useProtectedImage } from '@/hooks/useProtectedImage';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/initials';

/** The hospital logo, or a calm tile with its initials while there is none. */
export function HospitalLogo({
  hospital,
  className,
}: {
  hospital: Pick<SessionHospital, 'name' | 'logoUrl'>;
  className?: string;
}) {
  const src = useProtectedImage(hospital.logoUrl);

  return (
    <span
      className={cn(
        'relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent-soft text-sm font-bold text-accent',
        className,
      )}
    >
      <span aria-hidden="true">{initials(hospital.name)}</span>
      <AnimatePresence>
        {src && (
          <motion.img
            key={src}
            src={src}
            alt=""
            className="absolute inset-0 size-full bg-surface object-contain"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
    </span>
  );
}

// The hospital's logo and name at the top of the sidebar.
export function HospitalBrand({ hospital }: { hospital: SessionHospital }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <HospitalLogo hospital={hospital} />
      <span className="truncate text-sm leading-tight font-semibold text-foreground">
        {hospital.name}
      </span>
    </div>
  );
}
