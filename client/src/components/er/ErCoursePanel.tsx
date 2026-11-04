import { isClosed, type ErVisit } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRightLeft, DoorOpen, Hospital, Lock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { departmentLabel, type Department } from '@/components/departments/departmentDisplay';
import { patientName } from '@/components/patients/patientDisplay';
import { Button, Card, Modal, Select, Textarea } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

type Action = 'transfer' | 'discharge' | null;

function useCourse(visit: ErVisit) {
  const queryClient = useQueryClient();
  const settle = (updated: ErVisit) => {
    queryClient.setQueryData(queryKeys.erVisit(visit.id), updated);
    void queryClient.invalidateQueries({ queryKey: queryKeys.erQueue });
  };
  const status = useMutation({
    mutationFn: async (next: 'WAITING' | 'IN_TREATMENT') =>
      (await api.put<{ visit: ErVisit }>(`/er/visits/${visit.id}/status`, { status: next })).data
        .visit,
    onSuccess: settle,
  });
  const close = useMutation({
    mutationFn: async (body: {
      kind: 'transfer' | 'discharge';
      departmentId?: string;
      note: string;
    }) =>
      (
        await api.post<{ visit: ErVisit }>(
          `/er/visits/${visit.id}/${body.kind}`,
          { departmentId: body.departmentId, note: body.note.trim() || null },
          { skipErrorToast: true },
        )
      ).data.visit,
    onSuccess: settle,
  });
  return { status, close };
}

function CloseForm({
  visit,
  kind,
  onDone,
}: {
  visit: ErVisit;
  kind: 'transfer' | 'discharge';
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { close } = useCourse(visit);
  const [departmentId, setDepartmentId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const { data: departments = [] } = useQuery({
    queryKey: queryKeys.departments,
    queryFn: async () =>
      (await api.get<{ departments: Department[] }>('/departments')).data.departments,
    enabled: kind === 'transfer',
  });
  const wards = departments.filter((department) => department.code !== 'EMERGENCY');
  const name = patientName(visit.patient, t);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (kind === 'transfer' && !departmentId) {
          setError(t('validation.required'));
          return playSound('error');
        }
        close.mutate(
          { kind, departmentId: kind === 'transfer' ? departmentId : undefined, note },
          {
            onSuccess: (updated) => {
              notify.success(
                kind === 'transfer'
                  ? t('triage.course.transferred', {
                      name,
                      department: updated.department ? departmentLabel(updated.department, t) : '',
                    })
                  : t('triage.course.discharged', { name }),
              );
              onDone();
              // Back to the waiting list: this patient has left it.
              void navigate('../../emergency', { relative: 'path' });
            },
            onError: (failure) => setError(describeApiError(failure).message),
          },
        );
      }}
    >
      {kind === 'transfer' && (
        <Select
          label={t('triage.course.department')}
          placeholder={t('triage.course.chooseDepartment')}
          required
          options={wards.map((department) => ({
            value: department.id,
            label: departmentLabel(department, t),
          }))}
          value={departmentId}
          onChange={(event) => {
            setDepartmentId(event.target.value);
            setError(undefined);
          }}
          error={error}
        />
      )}
      <Textarea
        label={
          kind === 'transfer' ? t('triage.course.transferNote') : t('triage.course.dischargeNote')
        }
        placeholder={
          kind === 'transfer'
            ? t('triage.course.transferNotePlaceholder')
            : t('triage.course.dischargeNotePlaceholder')
        }
        rows={3}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        error={kind === 'discharge' ? error : undefined}
      />
      <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:-bottom-5 sm:-mx-5 sm:-mb-5 sm:flex-row sm:justify-end sm:px-5">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          loading={close.isPending}
          icon={
            kind === 'transfer' ? (
              <ArrowRightLeft className="size-4" />
            ) : (
              <DoorOpen className="size-4" />
            )
          }
        >
          {kind === 'transfer'
            ? t('triage.course.confirmTransfer')
            : t('triage.course.confirmDischarge')}
        </Button>
      </div>
    </form>
  );
}

// The patient's course in the ER (task 2.17): waiting or in treatment, then
// transferred to a ward or discharged. Once closed, it says where they went.
export function ErCoursePanel({ visit }: { visit: ErVisit }) {
  const { t, i18n } = useTranslation();
  const [action, setAction] = useState<Action>(null);
  const { status } = useCourse(visit);
  const time = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  if (isClosed(visit.status)) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={calm}
        role="status"
        className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted p-4"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-muted">
          {visit.status === 'TRANSFERRED' ? (
            <Hospital className="size-5" aria-hidden="true" />
          ) : (
            <DoorOpen className="size-5" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold text-foreground">
            {visit.status === 'TRANSFERRED'
              ? t('triage.course.closedTransferred', {
                  department: visit.department ? departmentLabel(visit.department, t) : '—',
                  time: visit.closedAt ? time.format(new Date(visit.closedAt)) : '',
                })
              : t('triage.course.closedDischarged', {
                  time: visit.closedAt ? time.format(new Date(visit.closedAt)) : '',
                })}
          </p>
          {visit.closingNote && (
            <p className="text-sm whitespace-pre-line text-foreground">{visit.closingNote}</p>
          )}
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Lock className="size-3.5" aria-hidden="true" />
            {t('triage.course.closedHint')}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted">{t('triage.course.title')}</p>
        <div
          role="radiogroup"
          aria-label={t('triage.course.title')}
          className="inline-flex rounded-lg bg-surface-muted p-1"
        >
          {(['WAITING', 'IN_TREATMENT'] as const).map((value) => {
            const selected = visit.status === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={status.isPending}
                onClick={() => {
                  if (selected) return;
                  playSound('toggle');
                  status.mutate(value, {
                    onSuccess: () =>
                      notify.success(
                        t('triage.course.statusChanged', { status: t(`triage.course.${value}`) }),
                      ),
                  });
                }}
                className={cn(
                  'relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                  selected ? 'text-foreground' : 'text-muted hover:text-foreground',
                )}
              >
                {selected && (
                  <motion.span
                    layoutId={`course-${visit.id}`}
                    transition={calm}
                    className="absolute inset-0 rounded-md bg-surface shadow-soft"
                  />
                )}
                <span className="relative">{t(`triage.course.${value}`)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          icon={<ArrowRightLeft className="size-4" />}
          onClick={() => setAction('transfer')}
        >
          {t('triage.course.transfer')}
        </Button>
        <Button
          variant="outline"
          icon={<DoorOpen className="size-4" />}
          onClick={() => setAction('discharge')}
        >
          {t('triage.course.discharge')}
        </Button>
      </div>
      <Modal
        open={action !== null}
        onClose={() => setAction(null)}
        title={
          action === 'discharge'
            ? t('triage.course.dischargeTitle')
            : t('triage.course.transferTitle')
        }
        description={
          action === 'discharge'
            ? t('triage.course.dischargeHint')
            : t('triage.course.transferHint')
        }
        size="sm"
      >
        {action && <CloseForm visit={visit} kind={action} onDone={() => setAction(null)} />}
      </Modal>
    </Card>
  );
}
