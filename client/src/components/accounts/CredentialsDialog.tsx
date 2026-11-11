import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

/** The login details handed over once (staff 1.27, patients at reception 4.1). */
export type Credentials = { name: string; email: string; password: string };

function CopyRow({ label, value, copyLabel }: { label: string; value: string; copyLabel: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-muted px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <p dir="ltr" className="truncate text-start font-mono text-sm text-foreground">
          {value}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        aria-label={copyLabel}
        icon={copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
          } catch {
            // Clipboard blocked (permissions, insecure origin): say so instead of
            // pretending it worked; the value stays visible to copy by hand.
            notify.error(t('staff.copyFailed'));
            return;
          }
          setCopied(true);
          playSound('success');
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? t('staff.copied') : copyLabel}
      </Button>
    </div>
  );
}

export function CredentialsDialog({
  credentials,
  onClose,
  forPatient = false,
}: {
  credentials: Credentials | null;
  onClose: () => void;
  /** Handed to a patient at reception (4.1), not to an employee. */
  forPatient?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={credentials !== null}
      onClose={onClose}
      title={credentials ? t('staff.credentialsTitle', { name: credentials.name }) : ''}
      description={forPatient ? t('reception.credentialsBody') : t('staff.credentialsBody')}
      size="sm"
      footer={<Button onClick={onClose}>{t('staff.done')}</Button>}
    >
      {credentials && (
        <div className="space-y-2">
          <CopyRow
            label={t('staff.email')}
            value={credentials.email}
            copyLabel={t('staff.copyEmail')}
          />
          <CopyRow
            label={t('staff.password')}
            value={credentials.password}
            copyLabel={t('staff.copyPassword')}
          />
        </div>
      )}
    </Modal>
  );
}
