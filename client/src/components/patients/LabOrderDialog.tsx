import {
  LAB_PRIORITIES,
  LAB_TEST_GROUPS,
  labOrderSchema,
  type LabPriority,
  type LabTestCode,
  type LabTestGroup,
  type LabTestView,
} from '@nabd/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, FlaskConical, Siren } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Modal, Textarea } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

function LabOrderForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [codes, setCodes] = useState<LabTestCode[]>([]);
  const [priority, setPriority] = useState<LabPriority>('ROUTINE');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggle = (code: LabTestCode) => {
    playSound('tap');
    setError(null);
    setCodes((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    );
  };

  const send = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ tests: LabTestView[] }>(
          `/doctors/me/patients/${patientId}/lab-tests`,
          { codes, priority, notes },
          { skipErrorToast: true },
        )
      ).data.tests,
    onSuccess: (tests) => {
      notify.success(t('labTests.sent', { count: tests.length }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.patientFile(patientId) });
      onDone();
    },
    onError: (failure) => {
      setError(describeApiError(failure).message);
      playSound('error');
    },
  });

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!labOrderSchema.safeParse({ codes, priority, notes }).success) {
          setError(t('labTests.pickOne'));
          return playSound('error');
        }
        send.mutate();
      }}
    >
      {(Object.keys(LAB_TEST_GROUPS) as LabTestGroup[]).map((group) => (
        <fieldset key={group} className="min-w-0 space-y-2">
          <legend className="mb-2 text-xs font-semibold text-muted">
            {t(`labTests.groups.${group}`)}
          </legend>
          <div className="flex flex-wrap gap-2">
            {LAB_TEST_GROUPS[group].map((code) => {
              const chosen = codes.includes(code);
              return (
                <motion.button
                  key={code}
                  type="button"
                  aria-pressed={chosen}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => toggle(code)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                    chosen
                      ? 'border-accent bg-accent-soft text-foreground'
                      : 'border-border bg-surface text-muted hover:text-foreground',
                  )}
                >
                  <AnimatePresence initial={false}>
                    {chosen && (
                      <motion.span
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 'auto', opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={calm}
                        className="overflow-hidden"
                      >
                        <Check className="size-3.5 text-accent" aria-hidden="true" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {t(`labTests.codes.${code}`)}
                </motion.button>
              );
            })}
          </div>
        </fieldset>
      ))}

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
                  layoutId="lab-priority"
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

      <Textarea
        label={t('labTests.notes')}
        placeholder={t('labTests.notesPlaceholder')}
        rows={2}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />

      <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col gap-2 border-t border-border bg-surface p-4 sm:-bottom-5 sm:-mx-5 sm:-mb-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p
          role={error ? 'alert' : undefined}
          aria-live="polite"
          className={cn('text-sm', error ? 'text-danger' : 'text-muted')}
        >
          {error ?? t('labTests.chosen', { count: codes.length })}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="ghost" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={send.isPending} icon={<FlaskConical className="size-4" />}>
            {t('labTests.send')}
          </Button>
        </div>
      </div>
    </form>
  );
}

// A doctor orders lab tests for their patient (task 3.4): tests by lab
// section, routine or urgent, with a note for the lab.
export function LabOrderDialog({
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
      title={t('labTests.dialog', { name: patientName })}
      size="lg"
    >
      {open && <LabOrderForm patientId={patientId} onDone={onClose} />}
    </Modal>
  );
}
