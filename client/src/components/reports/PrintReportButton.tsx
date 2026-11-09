import type { ReportView } from '@nabd/shared';
import { Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { useSessionStore } from '@/stores/sessionStore';
import { usePeriodLabel } from './period';
import { ReportBody } from './ReportBody';

type Printable = Pick<ReportView, 'kind' | 'periodFrom' | 'periodTo' | 'data' | 'notes'> &
  Partial<Pick<ReportView, 'authorName' | 'createdAt'>>;

// Prints one report on its own page (task 3.11): a sheet with the hospital,
// the period and who sent it is mounted for the print and removed after.
export function PrintReportButton({
  report,
  className,
}: {
  report: Printable;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const period = usePeriodLabel();
  const hospital = useSessionStore((state) => state.user?.hospital.name);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return;
    document.body.classList.add('printing');
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    // Print once the sheet is on the page.
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('printing');
    };
  }, [printing]);

  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <>
      <Button
        variant="outline"
        className={className}
        icon={<Printer className="size-4" />}
        onClick={() => setPrinting(true)}
      >
        {t('reports.print')}
      </Button>
      {printing &&
        createPortal(
          <div className="print-sheet bg-white p-6 text-foreground" data-testid="print-sheet">
            <header className="mb-5 border-b border-border pb-3">
              <p className="text-sm text-muted">{hospital}</p>
              <h1 className="text-xl font-bold">
                {t('reports.printTitle', { kind: t(`reports.kinds.${report.kind}`) })}
              </h1>
              <p className="text-sm text-muted">
                <bdi>{period(report.periodFrom, report.periodTo)}</bdi>
                {report.authorName && <> · {report.authorName}</>}
                {report.createdAt && (
                  <>
                    {' '}
                    ·{' '}
                    <bdi>
                      {t('reports.sentAt', { date: when.format(new Date(report.createdAt)) })}
                    </bdi>
                  </>
                )}
              </p>
            </header>
            <ReportBody data={report.data} notes={report.notes} still />
          </div>,
          document.body,
        )}
    </>
  );
}
