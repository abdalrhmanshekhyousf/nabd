import {
  createInventoryItemSchema,
  stockMovementSchema,
  updateInventoryItemSchema,
  type InventoryCategory,
  type InventoryItemView,
  type StockMovementView,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ClipboardCheck,
  History,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  TriangleAlert,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import { useDeferredValue, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Card, Input, Modal, Spinner, StatusBadge, Textarea } from '@/components/ui';
import type { StatusTone } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fieldError } from '@/lib/fieldError';
import { calm } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { readCount } from '@/lib/numbers';
import { playSound } from '@/lib/sound';

type Kind = 'RESTOCK' | 'USE' | 'ADJUST';
type Dialog =
  | { type: 'add' }
  | { type: 'edit'; item: InventoryItemView }
  | { type: 'move'; item: InventoryItemView; kind: Kind }
  | { type: 'log'; item: InventoryItemView }
  | null;

/** Out, low, or fine: the item's badge and its bar's colour. */
function stockState(item: InventoryItemView): {
  key: 'ok' | 'low' | 'out';
  tone: StatusTone;
  bar: string;
} {
  if (item.quantity === 0) return { key: 'out', tone: 'danger', bar: 'bg-danger' };
  if (item.low) return { key: 'low', tone: 'warning', bar: 'bg-warning' };
  return { key: 'ok', tone: 'success', bar: 'bg-success' };
}

/** Errors per field from a failed parse, translated. */
function errorsOf(issues: { path: PropertyKey[]; message: string }[], t: TFunction) {
  const found: Record<string, string> = {};
  for (const issue of issues) {
    found[String(issue.path[0])] ??= fieldError(issue.message, t) ?? issue.message;
  }
  return found;
}

const UNITS = ['علبة', 'أمبولة', 'فيال', 'كيس', 'عبوة', 'قطعة', 'أنبوب', 'لفة', 'فيلم', 'مجموعة'];

function ItemForm({
  item,
  params,
  onDone,
}: {
  item?: InventoryItemView;
  params: Record<string, string>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [values, setValues] = useState({
    name: item?.name ?? '',
    unit: item?.unit ?? '',
    quantity: '',
    minQuantity: item ? String(item.minQuantity) : '',
    notes: item?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const set = (field: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  const save = useMutation({
    mutationFn: async (body: object) =>
      item
        ? (await api.patch<{ item: InventoryItemView }>(`/inventory/${item.id}`, body, { params }))
            .data.item
        : (await api.post<{ item: InventoryItemView }>('/inventory', body, { params })).data.item,
    onSuccess: (saved) => {
      notify.success(t(item ? 'inventory.saved' : 'inventory.added', { name: saved.name }));
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      onDone();
    },
    onError: (error) => {
      setErrors({ name: describeApiError(error).message });
      playSound('error');
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const body = {
          name: values.name,
          unit: values.unit,
          minQuantity: readCount(values.minQuantity),
          notes: values.notes,
          ...(!item && { quantity: values.quantity === '' ? 0 : readCount(values.quantity) }),
        };
        const parsed = (item ? updateInventoryItemSchema : createInventoryItemSchema).safeParse(
          body,
        );
        if (!parsed.success) {
          setErrors(errorsOf(parsed.error.issues, t));
          return playSound('error');
        }
        save.mutate(body);
      }}
    >
      <Input
        label={t('inventory.name')}
        placeholder={t('inventory.namePlaceholder')}
        required
        value={values.name}
        onChange={(event) => set('name')(event.target.value)}
        error={errors.name}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label={t('inventory.unit')}
          placeholder={t('inventory.unitPlaceholder')}
          required
          list="inventory-units"
          value={values.unit}
          onChange={(event) => set('unit')(event.target.value)}
          error={errors.unit}
        />
        <datalist id="inventory-units">
          {UNITS.map((unit) => (
            <option key={unit} value={unit} />
          ))}
        </datalist>
        {!item && (
          <Input
            label={t('inventory.openingQuantity')}
            inputMode="numeric"
            dir="ltr"
            placeholder="0"
            value={values.quantity}
            onChange={(event) => set('quantity')(event.target.value)}
            error={errors.quantity}
          />
        )}
        <Input
          label={t('inventory.minQuantity')}
          inputMode="numeric"
          dir="ltr"
          required
          value={values.minQuantity}
          onChange={(event) => set('minQuantity')(event.target.value)}
          error={errors.minQuantity}
        />
      </div>
      <Textarea
        label={t('inventory.notes')}
        rows={2}
        value={values.notes}
        onChange={(event) => set('notes')(event.target.value)}
      />
      <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:-bottom-5 sm:-mx-5 sm:-mb-5 sm:flex-row sm:justify-end sm:px-5">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {item ? t('inventory.save') : t('inventory.add')}
        </Button>
      </div>
    </form>
  );
}

function MovementForm({
  item,
  initialKind,
  params,
  onDone,
}: {
  item: InventoryItemView;
  initialKind: Kind;
  params: Record<string, string>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [count, setCount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const number = readCount(count);
  const after = Number.isNaN(number)
    ? null
    : kind === 'RESTOCK'
      ? item.quantity + number
      : kind === 'USE'
        ? item.quantity - number
        : number;
  const body =
    kind === 'ADJUST' ? { kind, counted: number, reason } : { kind, amount: number, reason };

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ item: InventoryItemView; becameLow: boolean }>(
          `/inventory/${item.id}/movements`,
          body,
          { params, skipErrorToast: true },
        )
      ).data,
    onSuccess: ({ item: saved, becameLow }) => {
      notify.success(t(`inventory.moved.${kind}`, { name: saved.name, quantity: saved.quantity }));
      if (becameLow) notify.warning(t('inventory.nowLow', { name: saved.name }));
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      onDone();
    },
    onError: (error) => {
      setErrors({ count: describeApiError(error).message });
      playSound('error');
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = stockMovementSchema.safeParse(body);
        if (!parsed.success) {
          const found = errorsOf(parsed.error.issues, t);
          setErrors({ count: found.amount ?? found.counted, reason: found.reason });
          return playSound('error');
        }
        if (after !== null && after < 0) {
          setErrors({
            count: t('inventory.notEnough', { quantity: item.quantity, unit: item.unit }),
          });
          return playSound('error');
        }
        save.mutate();
      }}
    >
      <div
        role="radiogroup"
        aria-label={t('inventory.movementKind')}
        className="grid grid-cols-3 gap-1 rounded-lg bg-surface-muted p-1"
      >
        {(['RESTOCK', 'USE', 'ADJUST'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={kind === value}
            onClick={() => {
              playSound('toggle');
              setKind(value);
              setErrors({});
            }}
            className={cn(
              'relative rounded-md px-2 py-1.5 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
              kind === value ? 'text-foreground' : 'text-muted hover:text-foreground',
            )}
          >
            {kind === value && (
              <motion.span
                layoutId={`movement-kind-${item.id}`}
                transition={calm}
                className="absolute inset-0 rounded-md bg-surface shadow-soft"
              />
            )}
            <span className="relative">{t(`inventory.kind.${value}`)}</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">
        {t('inventory.current', { quantity: item.quantity, unit: item.unit })}
      </p>
      <Input
        label={kind === 'ADJUST' ? t('inventory.counted') : t('inventory.amount')}
        inputMode="numeric"
        dir="ltr"
        required
        autoFocus
        value={count}
        onChange={(event) => setCount(event.target.value)}
        error={errors.count}
      />
      <AnimatePresence initial={false}>
        {after !== null && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={calm}
            aria-live="polite"
            className={cn(
              'overflow-hidden text-sm font-medium',
              after < 0
                ? 'text-danger'
                : after <= item.minQuantity
                  ? 'text-warning'
                  : 'text-success',
            )}
          >
            {t('inventory.after', { quantity: after, unit: item.unit })}
          </motion.p>
        )}
      </AnimatePresence>
      <Input
        label={kind === 'ADJUST' ? t('inventory.reasonRequired') : t('inventory.reason')}
        placeholder={t(`inventory.reasonPlaceholder.${kind}`)}
        required={kind === 'ADJUST'}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        error={errors.reason}
      />
      <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:-bottom-5 sm:-mx-5 sm:-mb-5 sm:flex-row sm:justify-end sm:px-5">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {t(`inventory.confirm.${kind}`)}
        </Button>
      </div>
    </form>
  );
}

function MovementLog({
  item,
  params,
}: {
  item: InventoryItemView;
  params: Record<string, string>;
}) {
  const { t, i18n } = useTranslation();
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const { data: movements, isPending } = useQuery({
    queryKey: queryKeys.inventoryLog(item.id),
    queryFn: async () =>
      (
        await api.get<{ movements: StockMovementView[] }>(`/inventory/${item.id}/movements`, {
          params,
        })
      ).data.movements,
  });
  if (isPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }
  if (!movements?.length)
    return <p className="py-6 text-center text-sm text-muted">{t('inventory.noLog')}</p>;
  return (
    <ul className="divide-y divide-border" aria-label={t('inventory.log')}>
      {movements.map((m) => (
        <li key={m.id} className="flex items-center gap-3 py-2.5">
          <span
            dir="ltr"
            className={cn(
              'w-16 shrink-0 text-center font-semibold tabular-nums',
              m.change > 0 ? 'text-success' : 'text-danger',
            )}
          >
            {m.change > 0 ? `+${m.change}` : m.change}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">
              {t(`inventory.kind.${m.kind}`)}
              {m.reason ? ` · ${m.reason}` : ''}
            </p>
            <p className="text-xs text-muted">
              {m.byName} · <bdi>{when.format(new Date(m.createdAt))}</bdi>
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted tabular-nums">
            {t('inventory.left', { quantity: m.quantityAfter })}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ItemRow({
  item,
  onOpen,
}: {
  item: InventoryItemView;
  onOpen: (dialog: Exclude<Dialog, null | { type: 'add' }>) => void;
}) {
  const { t } = useTranslation();
  const state = stockState(item);
  // The bar fills at three times the minimum, so "low" reads at a glance.
  const fill = Math.min(1, item.quantity / Math.max(1, item.minQuantity * 3));
  const action = (label: string, icon: ReactNode, onClick: () => void) => (
    <Button
      size="icon"
      variant="ghost"
      className="size-9"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={calm}
      aria-label={item.name}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 sm:px-4"
    >
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-medium text-foreground">{item.name}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <span
            className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-muted"
            aria-hidden="true"
          >
            <motion.span
              className={cn('block h-full rounded-full', state.bar)}
              initial={false}
              animate={{ width: `${Math.max(4, fill * 100)}%` }}
              transition={calm}
            />
          </span>
          <span className="text-xs text-muted">
            {t('inventory.minimum', { quantity: item.minQuantity, unit: item.unit })}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <p className="min-w-20 text-end">
          <span className="text-lg font-bold text-foreground tabular-nums">{item.quantity}</span>{' '}
          <span className="text-xs text-muted">{item.unit}</span>
        </p>
        <StatusBadge tone={state.tone}>{t(`inventory.state.${state.key}`)}</StatusBadge>
      </div>
      <div className="flex items-center gap-0.5">
        {action(t('inventory.kind.RESTOCK'), <Plus className="size-4" />, () =>
          onOpen({ type: 'move', item, kind: 'RESTOCK' }),
        )}
        {action(t('inventory.kind.USE'), <Minus className="size-4" />, () =>
          onOpen({ type: 'move', item, kind: 'USE' }),
        )}
        {action(t('inventory.kind.ADJUST'), <ClipboardCheck className="size-4" />, () =>
          onOpen({ type: 'move', item, kind: 'ADJUST' }),
        )}
        {action(t('inventory.edit'), <Pencil className="size-4" />, () =>
          onOpen({ type: 'edit', item }),
        )}
        {action(t('inventory.log'), <History className="size-4" />, () =>
          onOpen({ type: 'log', item }),
        )}
      </div>
    </motion.li>
  );
}

// The stock of the pharmacy, the lab or imaging (task 3.2), one component for
// all three: the list with search and a low filter, adding items, receiving,
// using and counting stock, editing, and each item's movement log.
export function InventoryPanel({ category }: { category?: InventoryCategory }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const deferred = useDeferredValue(search.trim());
  // The admin names the stock to look at; specialists get their own.
  const params: Record<string, string> = category ? { category } : {};

  const { data, isPending } = useQuery({
    queryKey: queryKeys.inventory(category ?? 'mine', deferred),
    queryFn: async () =>
      (
        await api.get<{ category: InventoryCategory; items: InventoryItemView[] }>('/inventory', {
          params: { ...params, search: deferred },
        })
      ).data,
    placeholderData: (previous) => previous,
  });
  const items = data?.items ?? [];
  const low = items.filter((item) => item.low);
  const shown = onlyLow ? low : items;
  const title = data ? t(`inventory.title.${data.category}`) : '';
  const close = () => setDialog(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label={t('inventory.search')}
            placeholder={t('inventory.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-surface ps-9 pe-3 text-sm text-foreground placeholder:text-muted focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          aria-pressed={onlyLow}
          onClick={() => {
            playSound('toggle');
            setOnlyLow((value) => !value);
          }}
          className={cn(
            'inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
            onlyLow
              ? 'border-warning bg-warning/12 text-foreground'
              : 'border-input bg-surface text-muted hover:text-foreground',
          )}
        >
          <TriangleAlert className="size-4 text-warning" aria-hidden="true" />
          {t('inventory.onlyLow', { count: low.length })}
        </motion.button>
        <Button
          icon={<PackagePlus className="size-4" />}
          onClick={() => setDialog({ type: 'add' })}
        >
          {t('inventory.addItem')}
        </Button>
      </div>

      <p className="text-sm text-muted" aria-live="polite">
        {t('inventory.summary', { count: items.length, low: low.length })}
      </p>

      {isPending ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : shown.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted">
          {deferred || onlyLow ? t('inventory.noMatch') : t('inventory.empty')}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border" aria-label={title}>
            <AnimatePresence initial={false}>
              {shown.map((item) => (
                <ItemRow key={item.id} item={item} onOpen={setDialog} />
              ))}
            </AnimatePresence>
          </ul>
        </Card>
      )}

      <Modal
        open={dialog?.type === 'add' || dialog?.type === 'edit'}
        onClose={close}
        title={
          dialog?.type === 'edit'
            ? t('inventory.editTitle', { name: dialog.item.name })
            : t('inventory.addTitle')
        }
        size="lg"
      >
        {dialog?.type === 'add' && <ItemForm params={params} onDone={close} />}
        {dialog?.type === 'edit' && (
          <ItemForm key={dialog.item.id} item={dialog.item} params={params} onDone={close} />
        )}
      </Modal>
      <Modal
        open={dialog?.type === 'move'}
        onClose={close}
        title={dialog?.type === 'move' ? dialog.item.name : ''}
        size="sm"
      >
        {dialog?.type === 'move' && (
          <MovementForm
            key={`${dialog.item.id}-${dialog.kind}`}
            item={dialog.item}
            initialKind={dialog.kind}
            params={params}
            onDone={close}
          />
        )}
      </Modal>
      <Modal
        open={dialog?.type === 'log'}
        onClose={close}
        title={dialog?.type === 'log' ? t('inventory.logTitle', { name: dialog.item.name }) : ''}
      >
        {dialog?.type === 'log' && <MovementLog item={dialog.item} params={params} />}
      </Modal>
    </div>
  );
}
