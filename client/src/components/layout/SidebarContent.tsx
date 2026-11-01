import type { ReactNode } from 'react';
import type { SessionHospital } from '@/app/session';
import { HospitalBrand } from './HospitalBrand';
import { PoweredBy } from './PoweredBy';
import { SidebarNav } from './SidebarNav';

// Shared by the fixed desktop sidebar and the phone/tablet drawer.
export function SidebarContent({
  hospital,
  headerAction,
}: {
  hospital: SessionHospital;
  /** Extra control next to the hospital name (the drawer's close button). */
  headerAction?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
        <HospitalBrand hospital={hospital} />
        {headerAction}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarNav />
      </div>
      <div className="shrink-0 border-t border-border px-4 py-4">
        <PoweredBy />
      </div>
    </div>
  );
}
