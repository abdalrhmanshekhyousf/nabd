import { ESI_LEVELS, overrideReasonMissing, type ErVisit, type EsiLevel } from '@nabd/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, PencilLine, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Card, Modal, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';
import { ESI_BG } from './esiStyles';

function useSetLevel(visitId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { level: EsiLevel; reason: string | null }) =>
      (await api.put<{ visit: ErVisit }>(`/er/visits/${visitId}/level`, body)).data.visit,
    onSuccess: (visit) => {
      queryClient.setQueryData(queryKeys.erVisit(visitId), visit);
      void queryClient.invalidateQueries({ queryKey: queryKeys.erQueue });
      notify.success(
        visit.overrideReason
          ? t('triage.override.saved', { level: visit.level })
          : t('triage.override.restored', { level: visit.level }),
      );
    },
  });
}

function OverrideForm({ visit, onDone }: { visit: ErVisit; onDone: () => void }) {
  const { t } = useTranslation();
  const suggested = visit.suggestedLevel as EsiLevel;
  const [level, setLevel] = useState<EsiLevel>((visit.level ?? suggested) as EsiLevel);
  const [reason, setReason] = useState(visit.overrideReason ?? '');
  const [tried, setTried] = useState(false);
  const setLevelMutation = useSetLevel(visit.id);
  const missing = overrideReasonMissing(level, suggested, reason);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (missing) {
          playSound('error');
          return;
        }
        setLevelMutation.mutate({ level, reason: reason.trim() || null }, { onSuccess: onDone });
      }}
    >
      <div
        role="radiogroup"
        aria-label={t('triage.override.levels')}
        className="grid grid-cols-5 gap-2 p-1.5"
      >
        {ESI_LEVELS.map((value) => {
          const selected = value === level;
          return (
            <motion.button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${t('triage.level', { level: value })} · ${t(`triage.esi.L${value}`)}`}
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                playSound('toggle');
                setLevel(value);
              }}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center rounded-xl text-xl font-bold transition-all focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                ESI_BG[value],
                selected
                  ? 'scale-105 ring-[3px] ring-foreground/70 ring-offset-2 ring-offset-surface'
                  : 'opacity-55 hover:opacity-90',
              )}
            >
              {value}
              {value === suggested && (
                <span className="absolute -bottom-2 rounded-full bg-surface px-1.5 text-[10px] font-semibold text-foreground shadow-soft">
                  {t('triage.override.suggestedTag')}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
      <p className="pt-1 text-sm text-muted">
        {t(`triage.esi.L${level}`)} · {t(`triage.esiMeaning.L${level}`)}
      </p>
      <Textarea
        label={t('triage.override.reasonLabel')}
        placeholder={t('triage.override.reasonPlaceholder')}
        rows={3}
        required={level !== suggested}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        error={tried && missing ? t('triage.override.reasonNeeded') : undefined}
      />
      <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:-bottom-5 sm:-mx-5 sm:-mb-5 sm:flex-row sm:justify-end sm:px-5">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          loading={setLevelMutation.isPending}
          icon={<Check className="size-4" />}
        >
          {t('triage.override.save')}
        </Button>
      </div>
    </form>
  );
}

// Below the triage form: the level on record, and changing it with a reason
// (task 2.14). Outside the form on purpose, so its own form never submits it.
export function LevelOverride({ visit }: { visit: ErVisit }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const restore = useSetLevel(visit.id);
  if (visit.suggestedLevel === null || visit.level === null) return null;
  const overridden = visit.overrideReason !== null;
  const level = visit.level as EsiLevel;

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold',
          ESI_BG[level],
        )}
        aria-hidden="true"
      >
        {level}
      </span>
      <div className="min-w-0 flex-1" aria-live="polite">
        <p className="text-xs font-semibold text-muted">{t('triage.override.title')}</p>
        <p className="font-medium text-foreground">
          {overridden
            ? t('triage.override.changed', { level, suggested: visit.suggestedLevel })
            : t('triage.override.same', { level })}
        </p>
        {overridden && (
          <p className="text-sm text-muted">
            {t('triage.override.reason', { reason: visit.overrideReason })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {overridden && (
          <Button
            size="sm"
            variant="ghost"
            loading={restore.isPending}
            icon={<RotateCcw className="size-4" />}
            onClick={() =>
              restore.mutate({ level: visit.suggestedLevel as EsiLevel, reason: null })
            }
          >
            {t('triage.override.backToSuggested')}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          icon={<PencilLine className="size-4" />}
          onClick={() => setOpen(true)}
        >
          {t('triage.override.edit')}
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('triage.override.dialog')}
        description={t('triage.override.dialogHint', { suggested: visit.suggestedLevel })}
      >
        {open && <OverrideForm visit={visit} onDone={() => setOpen(false)} />}
      </Modal>
    </Card>
  );
}
