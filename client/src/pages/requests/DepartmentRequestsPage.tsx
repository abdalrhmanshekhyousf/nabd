import {
  purchaseRequestSchema,
  repairRequestSchema,
  REPAIR_URGENCIES,
  type DepartmentRequestContext,
  type PurchaseView,
  type RepairUrgency,
  type RepairView,
  type ShortItem,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown, PackagePlus, Plus, Send, ShoppingCart, Trash2, Wrench, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { departmentLabel } from '@/components/departments/departmentDisplay';
import { Button, Card, Input, Spinner, StatusBadge, Textarea } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';
import { REQUEST_TONE } from './requestDisplay';

type Row = {
  key: number;
  inventoryItemId: string | null;
  name: string;
  unit: string;
  quantity: string;
  unitCost: string;
};
type Lists = { purchases: PurchaseView[]; repairs: RepairView[] };

let nextKey = 1;
const blankRow = (more: Partial<Row> = {}): Row => ({
  key: nextKey++,
  inventoryItemId: null,
  name: '',
  unit: '',
  quantity: '1',
  unitCost: '',
  ...more,
});

const URGENCY_TONE = { LOW: 'neutral', NORMAL: 'info', URGENT: 'danger' } as const;

/** The head's purchase request: rows of items, what is short added in one tap. */
function PurchaseForm({ onSent }: { onSent: () => void }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<Row[]>(() => [blankRow()]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data: short } = useQuery({
    queryKey: queryKeys.shortages,
    queryFn: async () =>
      (await api.get<{ items: ShortItem[] }>('/department-requests/shortages')).data.items,
  });
  const set = (key: number, field: keyof Row, value: string) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );
  const total = rows.reduce(
    (sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.unitCost) || 0),
    0,
  );
  const send = useMutation({
    mutationFn: async (body: unknown) =>
      api.post('/department-requests/purchases', body, { skipErrorToast: true }),
    onSuccess: () => {
      playSound('success');
      notify.success(t('deptRequests.purchaseSent'));
      setRows([blankRow()]);
      setNote('');
      onSent();
    },
    onError: (failure) => {
      playSound('error');
      setError(describeApiError(failure).message);
    },
  });
  const added = new Set(rows.map((row) => row.inventoryItemId).filter(Boolean));
  const shortLeft = short?.filter((item) => !added.has(item.id)) ?? [];

  return (
    <form
      noValidate
      aria-label={t('deptRequests.purchase')}
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const body = {
          items: rows
            .filter((row) => row.name.trim())
            .map(({ inventoryItemId, name, unit, quantity, unitCost }) => ({
              inventoryItemId,
              name,
              unit,
              quantity,
              unitCost,
            })),
          note,
        };
        const parsed = purchaseRequestSchema.safeParse(body);
        if (!parsed.success) {
          playSound('error');
          setError(t('deptRequests.fillItems'));
          return;
        }
        setError(null);
        send.mutate(body);
      }}
    >
      {shortLeft.length > 0 && (
        <div className="space-y-2 rounded-xl border border-warning/40 bg-warning/6 p-3">
          <p className="text-sm font-medium text-foreground">{t('deptRequests.short')}</p>
          <div className="flex flex-wrap gap-2">
            {shortLeft.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  playSound('tap');
                  setRows((current) => [
                    ...current.filter((row) => row.name.trim()),
                    blankRow({
                      inventoryItemId: item.id,
                      name: item.name,
                      unit: item.unit,
                      quantity: String(Math.max(1, item.minQuantity * 2 - item.quantity)),
                    }),
                  ]);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs transition-colors hover:border-accent hover:text-accent"
              >
                <Plus className="size-3" aria-hidden="true" />
                {item.name}
                <span className="text-muted">
                  ({item.quantity}/{item.minQuantity})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <ul aria-label={t('deptRequests.items')} className="space-y-3">
        <AnimatePresence initial={false}>
          {rows.map((row, index) => (
            <motion.li
              key={row.key}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={calm}
              className="grid grid-cols-2 gap-2 rounded-xl border border-border p-3 sm:grid-cols-[2fr_1fr_1fr_1.3fr_auto] sm:items-end"
            >
              <div className="col-span-2 sm:col-span-1">
                <Input
                  label={t('deptRequests.itemName', { n: index + 1 })}
                  value={row.name}
                  onChange={(event) => set(row.key, 'name', event.target.value)}
                />
              </div>
              <Input
                label={t('deptRequests.unit')}
                value={row.unit}
                onChange={(event) => set(row.key, 'unit', event.target.value)}
              />
              <Input
                label={t('deptRequests.quantity')}
                type="number"
                min={1}
                inputMode="numeric"
                value={row.quantity}
                onChange={(event) => set(row.key, 'quantity', event.target.value)}
              />
              <Input
                label={t('deptRequests.unitCost')}
                type="number"
                min={0}
                inputMode="numeric"
                value={row.unitCost}
                onChange={(event) => set(row.key, 'unitCost', event.target.value)}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-10 justify-self-end text-muted hover:bg-danger/10 hover:text-danger"
                aria-label={t('deptRequests.removeItem', { n: index + 1 })}
                disabled={rows.length === 1}
                onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              >
                <Trash2 className="size-4" />
              </Button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        icon={<PackagePlus className="size-4" />}
        onClick={() => setRows((current) => [...current, blankRow()])}
      >
        {t('deptRequests.addItem')}
      </Button>
      <Textarea
        label={t('deptRequests.note')}
        rows={2}
        maxLength={300}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted">
          {t('deptRequests.total')}{' '}
          <bdi className="text-lg font-bold text-foreground tabular-nums">
            {formatMoney(total, i18n.language)}
          </bdi>
        </p>
        <Button type="submit" loading={send.isPending} icon={<Send className="size-4" />}>
          {t('deptRequests.send')}
        </Button>
      </div>
    </form>
  );
}

/** The head's repair report: which equipment, what is wrong, how urgent. */
function RepairForm({ onSent }: { onSent: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    equipment: '',
    description: '',
    urgency: 'NORMAL' as RepairUrgency,
  });
  const [errors, setErrors] = useState<
    Partial<Record<'equipment' | 'description' | 'form', string>>
  >({});
  const send = useMutation({
    mutationFn: async () =>
      api.post('/department-requests/repairs', form, { skipErrorToast: true }),
    onSuccess: () => {
      playSound('success');
      notify.success(t('deptRequests.repairSent'));
      setForm({ equipment: '', description: '', urgency: 'NORMAL' });
      onSent();
    },
    onError: (failure) => {
      playSound('error');
      setErrors({ form: describeApiError(failure).message });
    },
  });
  return (
    <form
      noValidate
      aria-label={t('deptRequests.repair')}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = repairRequestSchema.safeParse(form);
        if (!parsed.success) {
          const next: typeof errors = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path[0] as 'equipment' | 'description';
            next[key] ??= t(issue.message as 'validation.required');
          }
          setErrors(next);
          playSound('error');
          return;
        }
        setErrors({});
        send.mutate();
      }}
    >
      <Input
        label={t('deptRequests.equipment')}
        value={form.equipment}
        error={errors.equipment}
        onChange={(event) => setForm((current) => ({ ...current, equipment: event.target.value }))}
      />
      <Textarea
        label={t('deptRequests.problem')}
        rows={3}
        maxLength={500}
        value={form.description}
        error={errors.description}
        onChange={(event) =>
          setForm((current) => ({ ...current, description: event.target.value }))
        }
      />
      <div role="radiogroup" aria-label={t('deptRequests.urgency')} className="flex gap-2">
        {REPAIR_URGENCIES.map((urgency) => (
          <button
            key={urgency}
            type="button"
            role="radio"
            aria-checked={form.urgency === urgency}
            onClick={() => {
              playSound('toggle');
              setForm((current) => ({ ...current, urgency }));
            }}
            className={cn(
              'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
              form.urgency === urgency
                ? urgency === 'URGENT'
                  ? 'border-danger bg-danger/10 font-semibold text-danger'
                  : 'border-accent bg-accent-soft font-semibold text-accent'
                : 'border-border hover:border-accent',
            )}
          >
            {t(`deptRequests.urgencies.${urgency}`)}
          </button>
        ))}
      </div>
      {errors.form && (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      )}
      <Button type="submit" loading={send.isPending} icon={<Send className="size-4" />}>
        {t('deptRequests.send')}
      </Button>
    </form>
  );
}

function Withdraw({ onClick, pending }: { onClick: () => void; pending: boolean }) {
  const { t } = useTranslation();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      className="text-muted hover:bg-danger/10 hover:text-danger"
      icon={<X className="size-4" />}
      onClick={onClick}
    >
      {t('leave.withdraw')}
    </Button>
  );
}

// A department's requests (task 4.6 and the department heads addition): the
// head asks the administration to buy what is short (items, quantities, cost)
// and reports equipment that needs repair; the rest of the department sees
// the requests and tells the head what is missing.
export function DepartmentRequestsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'purchase' | 'repair'>('purchase');
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const { data: context } = useQuery({
    queryKey: queryKeys.requestContext,
    queryFn: async () =>
      (await api.get<DepartmentRequestContext>('/department-requests/context')).data,
  });
  const { data: lists } = useQuery({
    enabled: Boolean(context?.department),
    queryKey: queryKeys.departmentRequests,
    queryFn: async () => (await api.get<Lists>('/department-requests')).data,
  });
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.departmentRequests });
  const withdraw = useMutation({
    mutationFn: async ({ kind, id }: { kind: 'purchases' | 'repairs'; id: string }) =>
      api.delete(`/department-requests/${kind}/${id}`),
    onSuccess: () => {
      playSound('toggle');
      notify.success(t('leave.withdrawn'));
      refresh();
    },
  });

  if (!context) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!context.department) {
    return (
      <Card className="mx-auto max-w-xl px-6 py-12 text-center text-sm text-muted">
        {t('deptRequests.noDepartment')}
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">
          {t('deptRequests.title', { department: departmentLabel(context.department, t) })}
        </h2>
        <p className="text-sm text-muted">{t('deptRequests.description')}</p>
      </motion.div>

      <motion.div {...enter(1)}>
        {context.isHead ? (
          <Card className="space-y-4 p-4 sm:p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-accent">
              <Crown className="size-4" aria-hidden="true" />
              {t('deptRequests.youAreHead')}
            </p>
            <div role="tablist" className="flex gap-2 rounded-xl bg-surface-muted p-1">
              {(['purchase', 'repair'] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={tab === name}
                  onClick={() => {
                    playSound('toggle');
                    setTab(name);
                  }}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                    tab === name
                      ? 'bg-surface font-semibold text-foreground shadow-soft'
                      : 'text-muted hover:text-foreground',
                  )}
                >
                  {name === 'purchase' ? (
                    <ShoppingCart className="size-4" aria-hidden="true" />
                  ) : (
                    <Wrench className="size-4" aria-hidden="true" />
                  )}
                  {t(`deptRequests.${name}`)}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={calm}
              >
                {tab === 'purchase' ? (
                  <PurchaseForm onSent={refresh} />
                ) : (
                  <RepairForm onSent={refresh} />
                )}
              </motion.div>
            </AnimatePresence>
          </Card>
        ) : (
          <Card className="flex items-start gap-3 border-accent/30 bg-accent-soft/40 p-4 text-sm">
            <Crown className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
            <p className="text-foreground">
              {context.head
                ? t('deptRequests.throughHead', { name: context.head.fullName })
                : t('deptRequests.noHead')}
            </p>
          </Card>
        )}
      </motion.div>

      {!lists ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <motion.section
            {...enter(2)}
            aria-label={t('deptRequests.purchases')}
            className="space-y-3"
          >
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <ShoppingCart className="size-5 text-accent" aria-hidden="true" />
              {t('deptRequests.purchases')}
            </h3>
            {lists.purchases.length === 0 ? (
              <Card className="px-6 py-8 text-center text-sm text-muted">
                {t('deptRequests.noPurchases')}
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {lists.purchases.map((request) => (
                    <li key={request.id} className="space-y-2 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="min-w-0 flex-1 font-semibold text-foreground">
                          <bdi className="tabular-nums">
                            {formatMoney(request.totalCost, i18n.language)}
                          </bdi>
                          <span className="ms-2 text-xs font-normal text-muted">
                            {date.format(new Date(request.createdAt))}
                          </span>
                        </p>
                        <StatusBadge tone={REQUEST_TONE[request.status]}>
                          {t(`requests.status.${request.status}`)}
                        </StatusBadge>
                        {context.isHead && request.status === 'PENDING' && (
                          <Withdraw
                            pending={withdraw.isPending && withdraw.variables?.id === request.id}
                            onClick={() => withdraw.mutate({ kind: 'purchases', id: request.id })}
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted">
                        {request.items
                          .map(
                            (item) =>
                              `${item.name} × ${item.quantity}${item.unit ? ` ${item.unit}` : ''}`,
                          )
                          .join(' · ')}
                      </p>
                      {request.decisionNote && (
                        <p className="text-xs text-foreground">
                          {t('leave.note', { note: request.decisionNote })}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </motion.section>

          <motion.section
            {...enter(3)}
            aria-label={t('deptRequests.repairs')}
            className="space-y-3"
          >
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <Wrench className="size-5 text-accent" aria-hidden="true" />
              {t('deptRequests.repairs')}
            </h3>
            {lists.repairs.length === 0 ? (
              <Card className="px-6 py-8 text-center text-sm text-muted">
                {t('deptRequests.noRepairs')}
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {lists.repairs.map((request) => (
                    <li key={request.id} className="space-y-1 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="min-w-0 flex-1 font-semibold text-foreground">
                          {request.equipment}
                        </p>
                        <StatusBadge tone={URGENCY_TONE[request.urgency]} dot={false}>
                          {t(`deptRequests.urgencies.${request.urgency}`)}
                        </StatusBadge>
                        <StatusBadge tone={REQUEST_TONE[request.status]}>
                          {t(`requests.status.${request.status}`)}
                        </StatusBadge>
                        {context.isHead && request.status === 'PENDING' && (
                          <Withdraw
                            pending={withdraw.isPending && withdraw.variables?.id === request.id}
                            onClick={() => withdraw.mutate({ kind: 'repairs', id: request.id })}
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted">{request.description}</p>
                      {request.decisionNote && (
                        <p className="text-xs text-foreground">
                          {t('leave.note', { note: request.decisionNote })}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </motion.section>
        </div>
      )}
    </div>
  );
}
