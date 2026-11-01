import { LOGO_MAX_BYTES, LOGO_MIME_TYPES, type LogoMimeType } from '@nabd/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert, ImageUp, Trash2 } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import type { SessionHospital } from '@/app/session';
import { HospitalLogo } from '@/components/layout/HospitalBrand';
import { Button, Card, CardBody, CardHeader, Modal } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm, calmSpring } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';
import { useSessionStore } from '@/stores/sessionStore';

type Hospital = SessionHospital & Record<string, unknown>;

/** Checked in the browser with the server's own limits, before uploading anything. */
function problemWith(file: File) {
  if (!LOGO_MIME_TYPES.includes(file.type as LogoMimeType)) return 'logo.wrongType' as const;
  if (file.size > LOGO_MAX_BYTES) return 'logo.tooBig' as const;
  return null;
}

// Admin: upload, replace or remove the hospital logo (task 1.23).
export function LogoUploader({ hospital }: { hospital: Hospital }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<'logo.wrongType' | 'logo.tooBig' | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // The new logo shows in the sidebar straight away.
  function applySaved(saved: Hospital) {
    queryClient.setQueryData(queryKeys.hospital, saved);
    const { user, patchUser } = useSessionStore.getState();
    if (user) patchUser({ hospital: { ...user.hospital, logoUrl: saved.logoUrl } });
  }

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('logo', file);
      setProgress(0);
      const { data } = await api.put<{ hospital: Hospital }>('/hospital/logo', form, {
        onUploadProgress: (event) =>
          setProgress(event.total ? Math.round((event.loaded / event.total) * 100) : null),
      });
      return data.hospital;
    },
    onSuccess: (saved) => {
      applySaved(saved);
      notify.success(t('logo.uploaded'));
    },
    onSettled: () => setProgress(null),
  });

  const remove = useMutation({
    mutationFn: async () =>
      (await api.delete<{ hospital: Hospital }>('/hospital/logo')).data.hospital,
    onSuccess: (saved) => {
      applySaved(saved);
      setConfirmRemove(false);
      notify.success(t('logo.removed'));
    },
  });

  function pick(file: File | undefined) {
    if (!file) return;
    const found = problemWith(file);
    setProblem(found);
    if (found) {
      playSound('error');
      return;
    }
    upload.mutate(file);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files[0]);
  }

  const busy = upload.isPending || remove.isPending;

  return (
    <Card>
      <CardHeader title={t('logo.title')} description={t('logo.description')} />
      <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex flex-col items-center gap-2">
          <HospitalLogo hospital={hospital} className="size-24 rounded-2xl text-2xl" />
          {hospital.logoUrl && (
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:bg-danger/10"
              icon={<Trash2 className="size-4" />}
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
            >
              {t('logo.remove')}
            </Button>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <motion.div
            onDragOver={(event) => {
              event.preventDefault();
              if (!dragging) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            animate={{ scale: dragging ? 1.02 : 1 }}
            transition={calmSpring}
            className={cn(
              'relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
              dragging ? 'border-accent bg-accent-soft' : 'border-input bg-surface-muted/40',
            )}
          >
            <motion.span
              animate={{ y: dragging ? -4 : 0 }}
              transition={calmSpring}
              className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent"
            >
              <ImageUp className="size-5" aria-hidden="true" />
            </motion.span>
            <p className="text-sm text-foreground">
              {dragging ? t('logo.dropNow') : t('logo.drop')}
            </p>
            <div className="flex items-center gap-2 text-sm text-muted">
              <span>{t('logo.or')}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {t('logo.choose')}
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={LOGO_MIME_TYPES.join(',')}
              className="sr-only"
              tabIndex={-1}
              aria-label={t('logo.choose')}
              onChange={(event) => {
                pick(event.target.files?.[0]);
                event.target.value = '';
              }}
            />

            <AnimatePresence>
              {progress !== null && (
                <motion.div
                  className="absolute inset-x-0 bottom-0 h-1 bg-border"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    className="h-full bg-accent"
                    animate={{ width: `${progress}%` }}
                    transition={calm}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <p className="text-xs text-muted" aria-live="polite">
            {progress !== null ? t('logo.uploading', { percent: progress }) : t('logo.rules')}
          </p>
          <AnimatePresence>
            {problem && (
              <motion.p
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center gap-1.5 text-xs text-danger"
              >
                <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                {t(problem)}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </CardBody>

      <Modal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={t('logo.removeTitle')}
        description={t('logo.removeBody')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              {t('logo.remove')}
            </Button>
          </>
        }
      />
    </Card>
  );
}
