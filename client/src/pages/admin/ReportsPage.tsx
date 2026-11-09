import type { ReportView } from '@nabd/shared';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { ReportBody } from '@/components/reports/ReportBody';
import { usePeriodLabel } from '@/components/reports/period';
import { ReportList } from '@/components/reports/ReportList';
import { PrintReportButton } from '@/components/reports/PrintReportButton';
import { Card, Modal, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { enter } from '@/lib/motion';

function OpenReport({ id }: { id: string }) {
  const { t } = useTranslation();
  const period = usePeriodLabel();
  // Opening marks it read on the server, which refreshes the list.
  const { data: report } = useQuery({
    queryKey: queryKeys.report(id),
    queryFn: async () => (await api.get<{ report: ReportView }>(`/reports/${id}`)).data.report,
  });
  if (!report) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {t('reports.from', { kind: t(`reports.kinds.${report.kind}`), author: report.authorName })}
        {' · '}
        <bdi>{period(report.periodFrom, report.periodTo)}</bdi>
      </p>
      <ReportBody data={report.data} notes={report.notes} />
      <div className="flex justify-end">
        <PrintReportButton report={report} className="w-full sm:w-auto" />
      </div>
    </div>
  );
}

// The admin's inbox of department reports (task 3.11); a notification opens
// one through ?open=<id>.
export function ReportsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  const { data: reports, isPending } = useQuery({
    queryKey: queryKeys.reports,
    queryFn: async () => (await api.get<{ reports: ReportView[] }>('/reports')).data.reports,
  });
  const open = (id: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id) next.set('open', id);
        else next.delete('open');
        return next;
      },
      { replace: true },
    );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('reports.adminTitle')}</h2>
        <p className="text-sm text-muted">{t('reports.adminDescription')}</p>
      </motion.div>
      <motion.div {...enter(1)}>
        {isPending ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : reports?.length ? (
          <ReportList reports={reports} onOpen={(report) => open(report.id)} forAdmin />
        ) : (
          <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Inbox className="size-8 text-muted" aria-hidden="true" />
            <p className="font-semibold text-foreground">{t('reports.none')}</p>
            <p className="text-sm text-muted">{t('reports.noneHint')}</p>
          </Card>
        )}
      </motion.div>
      <Modal
        open={openId !== null}
        onClose={() => open(null)}
        title={t(`reports.kinds.${reports?.find((r) => r.id === openId)?.kind ?? 'PHARMACY'}`)}
        size="lg"
      >
        {openId && <OpenReport key={openId} id={openId} />}
      </Modal>
    </div>
  );
}
