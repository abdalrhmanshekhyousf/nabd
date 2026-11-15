import type { DepartmentHead } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Modal, Spinner } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';
import { departmentLabel, type Department } from './departmentDisplay';

// The admin picks the department's head (user addition, task 4.4): one of its
// doctors, or for pharmacy, lab and radiology one of their own staff.
export function HeadDialog({
  department,
  onClose,
}: {
  department: Department | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<string | null>(department?.head?.id ?? null);
  const { data } = useQuery({
    enabled: department !== null,
    queryKey: queryKeys.headCandidates(department?.id ?? ''),
    queryFn: async () =>
      (
        await api.get<{ candidates: DepartmentHead[] }>(
          `/departments/${department!.id}/head-candidates`,
        )
      ).data.candidates,
  });
  const save = useMutation({
    mutationFn: async () =>
      api.put(`/departments/${department!.id}/head`, { userId: chosen }, { skipErrorToast: true }),
    onSuccess: () => {
      playSound('success');
      notify.success(t('heads.saved'));
      void queryClient.invalidateQueries({ queryKey: queryKeys.departments });
      onClose();
    },
    onError: (failure) => {
      playSound('error');
      notify.error(describeApiError(failure).message);
    },
  });
  const label = department ? departmentLabel(department, t) : '';

  return (
    <Modal
      open={department !== null}
      onClose={onClose}
      title={t('heads.title', { department: label })}
      description={department ? t(`heads.rule.${ruleOf(department)}`) : ''}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {!data ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div role="radiogroup" aria-label={t('heads.pick')} className="space-y-2">
          {data.length === 0 && <p className="text-sm text-muted">{t('heads.none')}</p>}
          {[...data, null].map((person) => {
            const id = person?.id ?? null;
            const selected = chosen === id;
            return (
              <button
                key={id ?? 'nobody'}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  playSound('toggle');
                  setChosen(id);
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border p-3 text-start transition-colors',
                  selected
                    ? 'border-accent bg-accent-soft/60'
                    : 'border-border bg-surface hover:border-accent',
                )}
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-full',
                    selected ? 'bg-accent text-white' : 'bg-surface-muted text-muted',
                  )}
                >
                  {person ? (
                    <UserRound className="size-4" aria-hidden="true" />
                  ) : (
                    <Crown className="size-4 opacity-40" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                  {person ? person.fullName : t('heads.nobody')}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

const ruleOf = (department: Department) =>
  department.code === 'PHARMACY' ||
  department.code === 'LABORATORY' ||
  department.code === 'RADIOLOGY'
    ? department.code
    : 'DOCTOR';
