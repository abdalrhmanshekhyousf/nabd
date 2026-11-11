import { Download, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { SessionHospital, SessionUser } from '@/app/session';
import { Popover } from '@/components/ui';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/initials';
import { useInstallOffer } from '@/hooks/useInstallOffer';
import { installOffer } from '@/lib/serviceWorker';
import { logout } from '@/lib/session';
import { SoundSettings } from './SoundSettings';

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function AccountMenu({ user, hospital }: { user: SessionUser; hospital: SessionHospital }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canInstall = useInstallOffer();

  return (
    <Popover
      label={`${t('shell.account')}: ${user.fullName}`}
      trigger={<Avatar name={user.fullName} className="size-8 text-xs" />}
    >
      {(close) => (
        <div>
          <div className="flex items-center gap-3 border-b border-border p-4">
            <Avatar name={user.fullName} className="size-10 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{user.fullName}</p>
              <p className="truncate text-xs text-muted">
                {t(`roles.${user.role}`)} · {hospital.name}
              </p>
            </div>
          </div>
          <SoundSettings />
          <div className="p-2">
            {canInstall && (
              <button
                type="button"
                onClick={() => {
                  close();
                  void installOffer.install();
                }}
                className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-foreground transition-colors hover:bg-surface-muted focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
              >
                <Download className="size-4 text-accent" aria-hidden="true" />
                {t('shell.install')}
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                close();
                await logout();
                void navigate('/');
              }}
              className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-danger transition-colors hover:bg-danger/10 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
            >
              <LogOut className="size-4 rtl:-scale-x-100" aria-hidden="true" />
              {t('shell.logout')}
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
