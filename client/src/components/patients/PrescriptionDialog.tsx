import { zodResolver } from '@hookform/resolvers/zod';
import {
  createPrescriptionSchema,
  MAX_PRESCRIPTION_ITEMS,
  type CreatePrescriptionData,
  type CreatePrescriptionInput,
} from '@nabd/shared';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Pill, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { fieldError } from '@/lib/fieldError';
import { calm } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

const FREQUENCIES = ['once', 'twice', 'thrice', 'every8', 'bedtime', 'asNeeded'] as const;

const emptyItem = (): CreatePrescriptionInput['items'][number] => ({
  drugName: '',
  dose: '',
  frequency: '',
  durationDays: null,
  instructions: '',
});

const toDays = (value: unknown) =>
  value === '' || value === null || value === undefined ? null : Number(value);

function PrescriptionForm({
  patientId,
  allergies,
  onDone,
}: {
  patientId: string;
  allergies: string | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const frequencyList = useId();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreatePrescriptionInput, unknown, CreatePrescriptionData>({
    resolver: zodResolver(createPrescriptionSchema),
    defaultValues: { items: [emptyItem()], notes: '' },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const onSubmit = handleSubmit(
    async (values) => {
      try {
        await api.post(`/doctors/me/patients/${patientId}/prescriptions`, values, {
          skipErrorToast: true,
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.patientFile(patientId) }),
          queryClient.invalidateQueries({ queryKey: ['my-patients'] }),
        ]);
        notify.success(t('patients.prescriptionSaved'));
        onDone();
      } catch (error) {
        setError('notes', { message: describeApiError(error).message });
        playSound('error');
      }
    },
    () => playSound('error'),
  );

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      {allergies && (
        <p
          role="note"
          className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t('patients.allergyReminder', { allergies })}
        </p>
      )}

      <datalist id={frequencyList}>
        {FREQUENCIES.map((key) => (
          <option key={key} value={t(`patients.frequencies.${key}`)} />
        ))}
      </datalist>

      <ol className="space-y-3">
        <AnimatePresence initial={false}>
          {fields.map((field, index) => {
            const itemErrors = errors.items?.[index];
            return (
              <motion.li
                key={field.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={calm}
              >
                <fieldset className="min-w-0 space-y-3 rounded-xl border border-border p-3 sm:p-4">
                  <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold text-muted">
                    <Pill className="size-3.5 text-accent" aria-hidden="true" />
                    {t('patients.medicine', { n: index + 1 })}
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label={t('patients.drugName')}
                      required
                      error={fieldError(itemErrors?.drugName?.message, t)}
                      {...register(`items.${index}.drugName`)}
                    />
                    <Input
                      label={t('patients.dose')}
                      placeholder={t('patients.dosePlaceholder')}
                      required
                      error={fieldError(itemErrors?.dose?.message, t)}
                      {...register(`items.${index}.dose`)}
                    />
                    <Input
                      label={t('patients.frequency')}
                      list={frequencyList}
                      required
                      error={fieldError(itemErrors?.frequency?.message, t)}
                      {...register(`items.${index}.frequency`)}
                    />
                    <Input
                      label={t('patients.durationDays')}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={365}
                      dir="ltr"
                      error={fieldError(itemErrors?.durationDays?.message, t)}
                      {...register(`items.${index}.durationDays`, { setValueAs: toDays })}
                    />
                    <Input
                      label={t('patients.instructions')}
                      placeholder={t('patients.instructionsPlaceholder')}
                      containerClassName="sm:col-span-2"
                      error={fieldError(itemErrors?.instructions?.message, t)}
                      {...register(`items.${index}.instructions`)}
                    />
                  </div>
                  {fields.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted hover:bg-danger/10 hover:text-danger"
                      icon={<Trash2 className="size-4" />}
                      onClick={() => remove(index)}
                    >
                      {t('patients.removeMedicine', { n: index + 1 })}
                    </Button>
                  )}
                </fieldset>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>

      {fields.length < MAX_PRESCRIPTION_ITEMS && (
        <Button
          variant="outline"
          size="sm"
          icon={<Plus className="size-4" />}
          onClick={() => append(emptyItem())}
        >
          {t('patients.addMedicine')}
        </Button>
      )}

      <Textarea
        label={t('patients.prescriptionNotes')}
        rows={2}
        error={fieldError(errors.notes?.message, t)}
        {...register('notes')}
      />

      <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:-bottom-5 sm:-mx-5 sm:-mb-5 sm:flex-row sm:justify-end sm:px-5">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={isSubmitting} icon={<Check className="size-4" />}>
          {t('patients.savePrescription')}
        </Button>
      </div>
    </form>
  );
}

// A prescription of one or more medicines (task 2.8); it goes to the pharmacy.
export function PrescriptionDialog({
  open,
  onClose,
  patientId,
  patientName,
  allergies,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  allergies: string | null;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('patients.prescriptionDialog', { name: patientName })}
      size="lg"
    >
      {open && <PrescriptionForm patientId={patientId} allergies={allergies} onDone={onClose} />}
    </Modal>
  );
}
