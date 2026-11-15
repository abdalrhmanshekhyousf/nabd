import type { LeaveView, PurchaseView, RepairView, RequestKind, RequestStatus } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarOff, Check, ShoppingCart, Wrench, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { departmentLabel } from '@/components/departments/departmentDisplay';
import { Button, Card, Modal, Spinner, StatusBadge, Textarea } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';
import { dateRange, REQUEST_TONE } from '@/pages/requests/requestDisplay';

type Lists = { leave: LeaveView[]; purchases: PurchaseView[]; repairs: RepairView[] };
type Target = { kind: RequestKind; id: string; title: string };

const URGENCY_TONE = { LOW: 'neutral', NORMAL: 'info', URGENT: 'danger' } as const;

function Item({
  title,
  meta,
  children,
  status,
  onApprove,
  onReject,
  approving,
}: {
  title: string;
  meta: string;
  children?: ReactNode;
  status: RequestStatus;
  onApprove: () => void;
  onReject: () => void;
  approving: boolean;
}) {
  const { t } = useTranslation();
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={calm}
      aria-label={title}
      className="space-y-2 px-4 py-3"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-48">
          <p className="font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted">{meta}</p>
        </div>
        {status !== 'PENDING' && (
          <StatusBadge tone={REQUEST_TONE[status]}>{t(`requests.status.${status}`)}</StatusBadge>
        )}
      </div>
      {children}
      {status === 'PENDING' && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            loading={approving}
            icon={<Check className="size-4" />}
            onClick={onApprove}
          >
            {t('approvals.approve')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted hover:bg-danger/10 hover:text-danger"
            icon={<X className="size-4" />}
            onClick={onReject}
          >
            {t('approvals.reject')}
          </Button>
        </div>
      )}
    </motion.li>
  );
}

function Column({
  title,
  icon,
  count,
  empty,
  children,
}: {
  title: string;
  icon: ReactNode;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold text-foreground">
        {icon}
        {title}
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted tabular-nums">
          {count}
        </span>
      </h3>
      {count === 0 ? (
        <Card className="px-6 py-8 text-center text-sm text-muted">{empty}</Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            <AnimatePresence initial={false}>{children}</AnimatePresence>
          </ul>
        </Card>
      )}
    </section>
  );
}

// The admin's approvals (task 4.7): staff leave, and the departments' purchase
// and repair requests (filed by their heads). Approve, or reject saying why;
// the requester is told, and an approved leave tells the person's head too.
export function ApprovalsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'PENDING' | 'DECIDED'>('PENDING');
  const [rejecting, setRejecting] = useState<Target | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const { data } = useQuery({
    queryKey: queryKeys.approvals(status),
    queryFn: async () => (await api.get<Lists>('/approvals', { params: { status } })).data,
  });
  const decide = useMutation({
    mutationFn: async ({
      kind,
      id,
      decision,
      note,
    }: {
      kind: RequestKind;
      id: string;
      decision: 'APPROVED' | 'REJECTED';
      note?: string;
    }) =>
      api.post(
        `/approvals/${kind}/${id}`,
        { decision, note: note ?? null },
        { skipErrorToast: true },
      ),
    onSuccess: (_, { decision }) => {
      playSound(decision === 'APPROVED' ? 'success' : 'toggle');
      notify.success(t(decision === 'APPROVED' ? 'approvals.approved' : 'approvals.rejected'));
      setRejecting(null);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: (failure) => {
      playSound('error');
      notify.error(describeApiError(failure).message);
    },
  });
  const approving = (id: string) =>
    decide.isPending && decide.variables?.id === id && decide.variables.decision === 'APPROVED';
  const pendingTotal = data ? data.leave.length + data.purchases.length + data.repairs.length : 0;
  const who = (department: LeaveView['requester']['department']) =>
    department ? departmentLabel(department, t) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h2 className="text-xl font-bold text-foreground">{t('approvals.title')}</h2>
          <p className="text-sm text-muted">{t('approvals.description')}</p>
        </div>
        <div role="tablist" className="flex gap-1 rounded-xl bg-surface-muted p-1">
          {(['PENDING', 'DECIDED'] as const).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={status === name}
              onClick={() => {
                playSound('toggle');
                setStatus(name);
              }}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm transition-colors',
                status === name
                  ? 'bg-surface font-semibold text-foreground shadow-soft'
                  : 'text-muted hover:text-foreground',
              )}
            >
              {t(`approvals.tabs.${name}`)}
              {name === 'PENDING' && status === 'PENDING' && data ? ` (${pendingTotal})` : ''}
            </button>
          ))}
        </div>
      </motion.div>

      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <motion.div {...enter(1)} className="grid gap-6 lg:grid-cols-3 lg:items-start">
          <Column
            title={t('approvals.leave')}
            icon={<CalendarOff className="size-5 text-accent" aria-hidden="true" />}
            count={data.leave.length}
            empty={t('approvals.none')}
          >
            {data.leave.map((request) => (
              <Item
                key={request.id}
                title={request.requester.fullName}
                meta={[t(`roles.${request.requester.role}`), who(request.requester.department)]
                  .filter(Boolean)
                  .join(' · ')}
                status={request.status}
                approving={approving(request.id)}
                onApprove={() =>
                  decide.mutate({ kind: 'leave', id: request.id, decision: 'APPROVED' })
                }
                onReject={() =>
                  setRejecting({ kind: 'leave', id: request.id, title: request.requester.fullName })
                }
              >
                <p className="text-sm text-foreground">
                  <bdi className="font-medium">
                    {dateRange(request.from, request.to, i18n.language)}
                  </bdi>{' '}
                  <span className="text-xs text-muted">
                    · {t('leave.days', { count: request.days })}
                  </span>
                </p>
                <p className="text-sm text-muted">{request.reason}</p>
                {request.decisionNote && (
                  <p className="text-xs text-foreground">{request.decisionNote}</p>
                )}
              </Item>
            ))}
          </Column>

          <Column
            title={t('approvals.purchases')}
            icon={<ShoppingCart className="size-5 text-accent" aria-hidden="true" />}
            count={data.purchases.length}
            empty={t('approvals.none')}
          >
            {data.purchases.map((request) => (
              <Item
                key={request.id}
                title={departmentLabel(request.department, t)}
                meta={[request.requestedByName, date.format(new Date(request.createdAt))]
                  .filter(Boolean)
                  .join(' · ')}
                status={request.status}
                approving={approving(request.id)}
                onApprove={() =>
                  decide.mutate({ kind: 'purchase', id: request.id, decision: 'APPROVED' })
                }
                onReject={() =>
                  setRejecting({
                    kind: 'purchase',
                    id: request.id,
                    title: departmentLabel(request.department, t),
                  })
                }
              >
                <ul className="space-y-0.5 text-xs text-muted">
                  {request.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span>
                        {item.name} × {item.quantity}
                        {item.unit ? ` ${item.unit}` : ''}
                      </span>
                      <bdi className="tabular-nums">
                        {formatMoney(item.quantity * item.unitCost, i18n.language)}
                      </bdi>
                    </li>
                  ))}
                </ul>
                <p className="flex justify-between border-t border-border pt-1 text-sm font-semibold text-foreground">
                  <span>{t('deptRequests.total')}</span>
                  <bdi className="tabular-nums">
                    {formatMoney(request.totalCost, i18n.language)}
                  </bdi>
                </p>
                {request.note && <p className="text-xs text-muted">{request.note}</p>}
                {request.decisionNote && (
                  <p className="text-xs text-foreground">{request.decisionNote}</p>
                )}
              </Item>
            ))}
          </Column>

          <Column
            title={t('approvals.repairs')}
            icon={<Wrench className="size-5 text-accent" aria-hidden="true" />}
            count={data.repairs.length}
            empty={t('approvals.none')}
          >
            {data.repairs.map((request) => (
              <Item
                key={request.id}
                title={request.equipment}
                meta={[
                  departmentLabel(request.department, t),
                  request.requestedByName,
                  date.format(new Date(request.createdAt)),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                status={request.status}
                approving={approving(request.id)}
                onApprove={() =>
                  decide.mutate({ kind: 'repair', id: request.id, decision: 'APPROVED' })
                }
                onReject={() =>
                  setRejecting({ kind: 'repair', id: request.id, title: request.equipment })
                }
              >
                <StatusBadge tone={URGENCY_TONE[request.urgency]} dot={false}>
                  {t(`deptRequests.urgencies.${request.urgency}`)}
                </StatusBadge>
                <p className="text-sm text-muted">{request.description}</p>
                {request.decisionNote && (
                  <p className="text-xs text-foreground">{request.decisionNote}</p>
                )}
              </Item>
            ))}
          </Column>
        </motion.div>
      )}

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={t('approvals.rejectTitle', { title: rejecting?.title ?? '' })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={decide.isPending}
              onClick={() => {
                if (!note.trim()) {
                  setNoteError(t('validation.required'));
                  playSound('error');
                  return;
                }
                setNoteError(null);
                if (rejecting) {
                  decide.mutate({
                    kind: rejecting.kind,
                    id: rejecting.id,
                    decision: 'REJECTED',
                    note,
                  });
                }
              }}
            >
              {t('approvals.reject')}
            </Button>
          </>
        }
      >
        <Textarea
          label={t('approvals.why')}
          rows={3}
          maxLength={300}
          value={note}
          error={noteError ?? undefined}
          onChange={(event) => setNote(event.target.value)}
        />
      </Modal>
    </div>
  );
}
