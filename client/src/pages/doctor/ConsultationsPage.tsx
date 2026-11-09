import type { ConsultationView } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { FolderOpen, Inbox, Send, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { ConsultationCard } from '@/components/consultations/ConsultationCard';
import { Button, Card, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { enter } from '@/lib/motion';
import { notify } from '@/lib/notify';

type Lists = { received: ConsultationView[]; sent: ConsultationView[] };

function Withdraw({ id }: { id: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const withdraw = useMutation({
    mutationFn: () => api.delete(`/doctors/me/consultations/${id}`),
    onSuccess: () => notify.success(t('consultations.withdrawn')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.consultations }),
  });
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted hover:bg-danger/10 hover:text-danger"
      icon={<X className="size-4" />}
      loading={withdraw.isPending}
      onClick={() => withdraw.mutate()}
    >
      {t('consultations.withdraw')}
    </Button>
  );
}

function List({
  title,
  icon,
  empty,
  items,
  openId,
  index,
  action,
}: {
  title: string;
  icon: ReactNode;
  empty: string;
  items: ConsultationView[];
  openId: string | null;
  index: number;
  action?: (consultation: ConsultationView) => ReactNode;
}) {
  const waiting = items.filter((c) => c.status === 'PENDING').length;
  return (
    <motion.section {...enter(index)} aria-label={title} className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold text-foreground [&>svg]:size-5 [&>svg]:text-accent">
        {icon}
        {title}
        {waiting > 0 && (
          <span className="rounded-full bg-warning/15 px-2 text-xs text-warning tabular-nums">
            {waiting}
          </span>
        )}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            <AnimatePresence initial={false}>
              {items.map((consultation) => (
                <ConsultationCard
                  key={consultation.id}
                  consultation={consultation}
                  showPatient
                  highlight={consultation.id === openId}
                  action={action?.(consultation)}
                />
              ))}
            </AnimatePresence>
          </ul>
        </Card>
      )}
    </motion.section>
  );
}

// The doctor's consultations (task 3.12): questions colleagues asked me and the
// ones I asked. A notification opens it on its question (?open=<id>). Reading
// the file comes in 3.13, replying in 3.14.
export function ConsultationsPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const openId = params.get('open');
  const { data, isPending } = useQuery({
    queryKey: queryKeys.consultations,
    queryFn: async () => (await api.get<Lists>('/doctors/me/consultations')).data,
  });

  useEffect(() => {
    if (!openId || !data) return;
    document
      .querySelector(`[data-consultation="${CSS.escape(openId)}"]`)
      ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [openId, data]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('consultations.pageTitle')}</h2>
        <p className="text-sm text-muted">{t('consultations.pageDescription')}</p>
      </motion.div>
      {isPending || !data ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <>
          <List
            title={t('consultations.received')}
            icon={<Inbox />}
            empty={t('consultations.noneReceived')}
            items={data.received}
            openId={openId}
            index={1}
            action={(c) =>
              c.status === 'PENDING' && (
                <Link
                  to={c.id}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow-soft transition-colors hover:bg-primary/88"
                >
                  <FolderOpen className="size-4" aria-hidden="true" />
                  {t('consultations.openFile')}
                </Link>
              )
            }
          />
          <List
            title={t('consultations.sentTitle')}
            icon={<Send className="rtl:-scale-x-100" />}
            empty={t('consultations.noneSent')}
            items={data.sent}
            openId={openId}
            index={2}
            action={(c) => c.status === 'PENDING' && <Withdraw id={c.id} />}
          />
        </>
      )}
    </div>
  );
}
