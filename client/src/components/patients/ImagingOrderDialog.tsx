import {
  IMAGING_PARTS,
  LAB_PRIORITIES,
  RADIOLOGY_MODALITIES,
  imagingOrderSchema,
  type ImagingView,
  type LabPriority,
  type RadiologyModality,
} from '@nabd/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ScanLine, Siren } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fieldError } from '@/lib/fieldError';
import { calm } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

function ImagingOrderForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [modality, setModality] = useState<RadiologyModality>('XRAY');
  const [bodyPart, setBodyPart] = useState('');
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState<LabPriority>('ROUTINE');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const send = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ study: ImagingView }>(
          `/doctors/me/patients/${patientId}/imaging`,
          { modality, bodyPart, reason, priority },
          { skipErrorToast: true },
        )
      ).data.study,
    onSuccess: (study) => {
      notify.success(
        t('imaging.sent', { modality: t(`modalities.${study.modality}`), part: study.bodyPart }),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.patientFile(patientId) });
      onDone();
    },
    onError: (error) => {
      setErrors({ bodyPart: describeApiError(error).message });
      playSound('error');
    },
  });

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = imagingOrderSchema.safeParse({ modality, bodyPart, reason, priority });
        if (!parsed.success) {
          const found: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            found[String(issue.path[0])] ??= fieldError(issue.message, t) ?? issue.message;
          }
          setErrors(found);
          return playSound('error');
        }
        send.mutate();
      }}
    >
      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-2 text-sm font-medium text-foreground">
          {t('imaging.modality')}
        </legend>
        <div
          role="radiogroup"
          aria-label={t('imaging.modality')}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {RADIOLOGY_MODALITIES.map((value) => {
            const chosen = modality === value;
            return (
              <motion.button
                key={value}
                type="button"
                role="radio"
                aria-checked={chosen}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  playSound('toggle');
                  setModality(value);
                  setBodyPart('');
                  setErrors({});
                }}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                  chosen
                    ? 'border-accent bg-accent-soft text-foreground ring-1 ring-accent'
                    : 'border-border bg-surface text-muted hover:text-foreground',
                )}
              >
                <ScanLine
                  className={cn('size-4', chosen ? 'text-accent' : 'text-muted')}
                  aria-hidden="true"
                />
                {t(`modalities.${value}`)}
              </motion.button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Input
          label={t('imaging.bodyPart')}
          placeholder={t('imaging.bodyPartPlaceholder')}
          required
          value={bodyPart}
          onChange={(event) => {
            setBodyPart(event.target.value);
            setErrors((current) => ({ ...current, bodyPart: undefined }));
          }}
          error={errors.bodyPart}
        />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={modality}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={calm}
            className="flex flex-wrap gap-1.5"
          >
            {IMAGING_PARTS[modality].map((part) => {
              const label = t(`imaging.parts.${part}` as never);
              return (
                <button
                  key={part}
                  type="button"
                  aria-pressed={bodyPart === label}
                  onClick={() => {
                    playSound('tap');
                    setBodyPart(label);
                    setErrors((current) => ({ ...current, bodyPart: undefined }));
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                    bodyPart === label
                      ? 'border-accent bg-accent-soft text-foreground'
                      : 'border-border bg-surface text-muted hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      <Textarea
        label={t('imaging.reason')}
        placeholder={t('imaging.reasonPlaceholder')}
        rows={2}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{t('labTests.priority')}</p>
        <div
          role="radiogroup"
          aria-label={t('labTests.priority')}
          className="inline-flex rounded-lg bg-surface-muted p-1"
        >
          {LAB_PRIORITIES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={priority === value}
              onClick={() => {
                playSound('toggle');
                setPriority(value);
              }}
              className={cn(
                'relative inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                priority === value ? 'text-foreground' : 'text-muted hover:text-foreground',
              )}
            >
              {priority === value && (
                <motion.span
                  layoutId="imaging-priority"
                  transition={calm}
                  className={cn(
                    'absolute inset-0 rounded-md shadow-soft',
                    value === 'URGENT' ? 'bg-danger/12' : 'bg-surface',
                  )}
                />
              )}
              {value === 'URGENT' && (
                <Siren className="relative size-3.5 text-danger" aria-hidden="true" />
              )}
              <span className="relative">{t(`labTests.priorities.${value}`)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:-bottom-5 sm:-mx-5 sm:-mb-5 sm:flex-row sm:justify-end sm:px-5">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={send.isPending} icon={<ScanLine className="size-4" />}>
          {t('imaging.send')}
        </Button>
      </div>
    </form>
  );
}

// A doctor orders an imaging study for their patient (task 3.6): the type,
// the body part (common ones offered), the clinical question and the priority.
export function ImagingOrderDialog({
  open,
  onClose,
  patientId,
  patientName,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('imaging.dialog', { name: patientName })}
      size="lg"
    >
      {open && <ImagingOrderForm patientId={patientId} onDone={onClose} />}
    </Modal>
  );
}
