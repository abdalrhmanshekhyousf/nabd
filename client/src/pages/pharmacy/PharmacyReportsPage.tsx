import type { PharmacyReportData, ReportView } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CalendarRange, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { ReportBody } from '@/components/reports/ReportBody';
import { usePeriodLabel } from '@/components/reports/period';
import { ReportList } from '@/components/reports/ReportList';
import { PrintReportButton } from '@/components/reports/PrintReportButton';
import { UnavailableEditor } from '@/components/reports/UnavailableEditor';
import { badLine, type MissingLine } from '@/components/reports/missing';
import { Button, Card, Modal, Spinner, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { readCount } from '@/lib/numbers';
import { playSound } from '@/lib/sound';

const PRESETS = ['week', 'thisMonth', 'lastMonth'] as const;
type Preset = (typeof PRESETS)[number];

/** A preset as [from, to) in local days. */
function periodOf(preset: Preset, today = new Date()) {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const tomorrow = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  if (preset === 'week') {
    return { from: new Date(day.getFullYear(), day.getMonth(), day.getDate() - 6), to: tomorrow };
  }
  const monthStart = new Date(day.getFullYear(), day.getMonth(), 1);
  if (preset === 'thisMonth') return { from: monthStart, to: tomorrow };
  return { from: new Date(day.getFullYear(), day.getMonth() - 1, 1), to: monthStart };
}

// The pharmacist's reports (task 3.11): a period, its figures worked out live,
// notes, and sending it to the admin; the sent ones below, marked when read.
export function PharmacyReportsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const period = usePeriodLabel();
  const [preset, setPreset] = useState<Preset>('week');
  const [notes, setNotes] = useState('');
  const [opened, setOpened] = useState<ReportView | null>(null);
  // The pharmacist's corrections to the missing medicines; null keeps the worked-out list.
  const [edited, setEdited] = useState<MissingLine[] | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const range = useMemo(() => {
    const { from, to } = periodOf(preset);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [preset]);

  const preview = useQuery({
    queryKey: queryKeys.reportPreview(range.from, range.to),
    queryFn: async () =>
      (await api.get<{ data: PharmacyReportData }>('/reports/preview', { params: range })).data
        .data,
  });
  const lines: MissingLine[] =
    edited ??
    (preview.data?.unavailable ?? []).map((row, i) => ({
      key: `auto-${i}`,
      drugName: row.drugName,
      times: String(row.times),
    }));
  const unavailable = lines.map((line) => ({
    drugName: line.drugName.trim(),
    times: readCount(line.times),
  }));
  const sent = useQuery({
    queryKey: queryKeys.reports,
    queryFn: async () => (await api.get<{ reports: ReportView[] }>('/reports')).data.reports,
  });
  const send = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ report: ReportView }>('/reports', {
          kind: 'PHARMACY',
          ...range,
          notes: notes.trim() || null,
          ...(edited ? { unavailable } : {}),
        })
      ).data.report,
    onSuccess: () => {
      notify.success(t('reports.sent'));
      setNotes('');
      setEdited(null);
      setShowErrors(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports });
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('reports.title')}</h2>
        <p className="text-sm text-muted">{t('reports.description')}</p>
      </motion.div>

      <motion.div {...enter(1)}>
        <Card className="space-y-5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <CalendarRange className="size-4 text-accent" aria-hidden="true" />
              {t('reports.period')}
            </span>
            <div
              role="radiogroup"
              aria-label={t('reports.period')}
              className="flex flex-wrap gap-1.5"
            >
              {PRESETS.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={preset === name}
                  onClick={() => {
                    playSound('toggle');
                    setPreset(name);
                    setEdited(null);
                    setShowErrors(false);
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent',
                    preset === name
                      ? 'border-accent bg-accent text-white'
                      : 'border-border text-muted hover:border-accent hover:text-foreground',
                  )}
                >
                  {t(`reports.presets.${name}`)}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted sm:ms-auto">
              <bdi>{period(range.from, range.to)}</bdi>
            </span>
          </div>

          <section aria-label={t('reports.preview')} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-foreground">{t('reports.preview')}</h3>
              {preview.data && (
                <PrintReportButton
                  report={{
                    kind: 'PHARMACY',
                    periodFrom: range.from,
                    periodTo: range.to,
                    data: { ...preview.data, unavailable },
                    notes: notes.trim() || null,
                  }}
                />
              )}
            </div>
            {preview.data ? (
              <ReportBody
                key={preset}
                data={preview.data}
                unavailableEditor={
                  <UnavailableEditor
                    lines={lines}
                    onChange={setEdited}
                    onReset={() => {
                      setEdited(null);
                      setShowErrors(false);
                    }}
                    showErrors={showErrors}
                  />
                }
              />
            ) : (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            )}
          </section>

          <form
            noValidate
            className="space-y-3 border-t border-border pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (edited?.some(badLine)) {
                setShowErrors(true);
                return playSound('error');
              }
              send.mutate();
            }}
          >
            <Textarea
              label={t('reports.notes')}
              hint={t('reports.notesHint')}
              rows={3}
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                loading={send.isPending}
                disabled={!preview.data}
                icon={<Send className="size-4 rtl:-scale-x-100" />}
                className="w-full sm:w-auto"
              >
                {t('reports.send')}
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>

      <motion.section {...enter(2)} aria-label={t('reports.sentList')} className="space-y-3">
        <h3 className="font-semibold text-foreground">{t('reports.sentList')}</h3>
        {sent.isPending ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : sent.data?.length ? (
          <ReportList reports={sent.data} onOpen={setOpened} forAdmin={false} />
        ) : (
          <p className="text-sm text-muted">{t('reports.noneSent')}</p>
        )}
      </motion.section>

      <Modal
        open={opened !== null}
        onClose={() => setOpened(null)}
        title={opened ? period(opened.periodFrom, opened.periodTo) : ''}
        size="lg"
      >
        {opened && (
          <div className="space-y-4">
            <ReportBody data={opened.data} notes={opened.notes} />
            <div className="flex justify-end">
              <PrintReportButton report={opened} className="w-full sm:w-auto" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
