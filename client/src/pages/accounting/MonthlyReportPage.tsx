import type { ReportView, RevenueReportData } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CalendarRange, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { PrintReportButton } from '@/components/reports/PrintReportButton';
import { ReportBody } from '@/components/reports/ReportBody';
import { ReportList } from '@/components/reports/ReportList';
import { usePeriodLabel } from '@/components/reports/period';
import { Button, Card, Modal, Spinner, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

const PRESETS = ['lastMonth', 'thisMonth'] as const;
type Preset = (typeof PRESETS)[number];

/** A month as [from, to) in local days. */
function periodOf(preset: Preset, today = new Date()) {
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  if (preset === 'thisMonth') {
    return {
      from: monthStart,
      to: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
    };
  }
  return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: monthStart };
}

// The accountant's monthly revenue report (task 4.16): a month's figures
// worked out live, notes, and sending it to the admin; the sent ones below.
export function MonthlyReportPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const period = usePeriodLabel();
  const [preset, setPreset] = useState<Preset>('lastMonth');
  const [notes, setNotes] = useState('');
  const [opened, setOpened] = useState<ReportView | null>(null);
  const range = useMemo(() => {
    const { from, to } = periodOf(preset);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [preset]);
  const preview = useQuery({
    queryKey: queryKeys.reportPreview(range.from, range.to),
    queryFn: async () =>
      (await api.get<{ data: RevenueReportData }>('/reports/preview', { params: range })).data.data,
  });
  const sent = useQuery({
    queryKey: queryKeys.reports,
    queryFn: async () => (await api.get<{ reports: ReportView[] }>('/reports')).data.reports,
  });
  const send = useMutation({
    mutationFn: async () =>
      api.post('/reports', { kind: 'REVENUE', ...range, notes: notes.trim() || null }),
    onSuccess: () => {
      playSound('success');
      notify.success(t('reports.sent'));
      setNotes('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports });
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('revenue.title')}</h2>
        <p className="text-sm text-muted">{t('revenue.description')}</p>
      </motion.div>

      <motion.div {...enter(1)}>
        <Card className="space-y-5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <CalendarRange className="size-4 text-accent" aria-hidden="true" />
              {t('reports.period')}
            </span>
            <div role="radiogroup" aria-label={t('reports.period')} className="flex gap-1.5">
              {PRESETS.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={preset === name}
                  onClick={() => {
                    playSound('toggle');
                    setPreset(name);
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm transition-colors',
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
                    kind: 'REVENUE',
                    periodFrom: range.from,
                    periodTo: range.to,
                    data: preview.data,
                    notes: notes.trim() || null,
                  }}
                />
              )}
            </div>
            {preview.data ? (
              <ReportBody key={preset} data={preview.data} />
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
              send.mutate();
            }}
          >
            <Textarea
              label={t('reports.notes')}
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
