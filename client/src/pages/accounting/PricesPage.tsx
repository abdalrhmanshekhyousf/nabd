import {
  LAB_TEST_CODES,
  RADIOLOGY_MODALITIES,
  SERVICE_KINDS,
  type ServiceKind,
  type ServicePriceView,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Card, Input, Select, Spinner } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

type List = {
  prices: ServicePriceView[];
  defaults: Record<ServiceKind, number>;
  /** Every medicine in stock, each priced on its own. */
  drugs: { id: string; name: string; unit: string }[];
};

/** Lab tests and medicines are priced one by one, in their own lists. */
const ITEMIZED: ServiceKind[] = ['LAB_TEST', 'DRUG'];

/** The services that can have their own price, per kind. */
function codesOf(kind: ServiceKind, t: (key: string) => string) {
  if (kind === 'IMAGING')
    return RADIOLOGY_MODALITIES.map((code) => ({ value: code, label: t(`modalities.${code}`) }));
  if (kind === 'VISIT') return [{ value: 'EMERGENCY', label: t('prices.emergencyVisit') }];
  return [];
}

function KindCard({ kind, list }: { kind: ServiceKind; list: List }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const own = list.prices.filter((row) => row.kind === kind);
  const base = own.find((row) => !row.code);
  const exact = ITEMIZED.includes(kind) ? [] : own.filter((row) => row.code);
  const codes = codesOf(kind, t as (key: string) => string).filter(
    (option) => !exact.some((row) => row.code === option.value),
  );
  const [basePrice, setBasePrice] = useState(String(base?.price ?? list.defaults[kind]));
  const [code, setCode] = useState('');
  const [codePrice, setCodePrice] = useState('');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.prices });
  const save = useMutation({
    mutationFn: async (body: { code: string; name: string; price: string }) =>
      api.put('/prices', { kind, ...body }, { skipErrorToast: true }),
    onSuccess: () => {
      playSound('success');
      notify.success(t('prices.saved'));
      setCode('');
      setCodePrice('');
      refresh();
    },
    onError: (failure) => {
      playSound('error');
      notify.error(describeApiError(failure).message);
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/prices/${id}`),
    onSuccess: () => {
      playSound('toggle');
      refresh();
    },
  });
  const kindName = t(`prices.kinds.${kind}`);

  return (
    <Card aria-label={kindName} className="space-y-4 p-4">
      <div className="space-y-0.5">
        <h3 className="font-semibold text-foreground">{kindName}</h3>
        <p className="text-xs text-muted">{t(`prices.hints.${kind}`)}</p>
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({ code: '', name: kindName, price: basePrice });
        }}
      >
        <div className="min-w-0 flex-1">
          <Input
            label={t('prices.basePrice')}
            type="number"
            min={0}
            inputMode="numeric"
            value={basePrice}
            onChange={(event) => setBasePrice(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          size="icon"
          className="size-11"
          aria-label={t('prices.saveBase', { kind: kindName })}
          loading={save.isPending && !save.variables?.code}
        >
          <Save className="size-4" />
        </Button>
      </form>

      {exact.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          <AnimatePresence initial={false}>
            {exact.map((row) => (
              <motion.li
                key={row.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0 }}
                transition={calm}
                className="flex items-center gap-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">{row.name}</span>
                <bdi className="font-medium tabular-nums">
                  {formatMoney(row.price, i18n.language)}
                </bdi>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-muted hover:bg-danger/10 hover:text-danger"
                  aria-label={t('prices.remove', { name: row.name })}
                  onClick={() => remove.mutate(row.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {codes.length > 0 && (
        <form
          className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[1.4fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const option = codes.find((c) => c.value === code);
            if (!option || codePrice === '') {
              playSound('error');
              return;
            }
            save.mutate({ code, name: option.label, price: codePrice });
          }}
        >
          <div className="col-span-2 sm:col-span-1">
            <Select
              label={t('prices.exact')}
              placeholder={t('prices.pick')}
              value={code}
              options={codes}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <Input
            label={t('prices.price')}
            type="number"
            min={0}
            inputMode="numeric"
            value={codePrice}
            onChange={(event) => setCodePrice(event.target.value)}
          />
          <Button
            type="submit"
            size="icon"
            className="size-11"
            aria-label={t('prices.addExact', { kind: kindName })}
            loading={save.isPending && Boolean(save.variables?.code)}
          >
            <Plus className="size-4" />
          </Button>
        </form>
      )}
    </Card>
  );
}

// The hospital's price list (task 4.12): what each kind of service costs, and
// the exact price of a lab test, an imaging modality or an ER visit. Every
// service a patient gets is charged to their account at these prices.
/** One line of an itemized list: its price, saved when changed. */
function ItemRow({
  kind,
  code,
  name,
  unit,
  price,
  own,
}: {
  kind: ServiceKind;
  code: string;
  name: string;
  unit?: string;
  price: number;
  own: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(price));
  const changed = value !== String(price) && value !== '' && Number(value) >= 0;
  const save = useMutation({
    mutationFn: async () =>
      api.put('/prices', { kind, code, name, price: value }, { skipErrorToast: true }),
    onSuccess: () => {
      playSound('success');
      notify.success(t('prices.saved'));
      void queryClient.invalidateQueries({ queryKey: queryKeys.prices });
    },
    onError: (failure) => {
      playSound('error');
      notify.error(describeApiError(failure).message);
    },
  });
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">{name}</span>
        <span className="block text-xs text-muted">
          {unit ? `${t('prices.per', { unit })} · ` : ''}
          {own ? t('prices.own') : t('prices.usual')}
        </span>
      </span>
      <form
        className="flex shrink-0 items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed) save.mutate();
        }}
      >
        <input
          type="number"
          min={0}
          inputMode="numeric"
          aria-label={t('prices.priceOf', { name })}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-9 w-28 rounded-lg border border-border bg-surface px-2 text-sm tabular-nums focus-visible:border-accent focus-visible:outline-none"
        />
        <Button
          type="submit"
          size="icon"
          className="size-9"
          disabled={!changed}
          loading={save.isPending}
          aria-label={t('prices.saveOne', { name })}
        >
          <Save className="size-4" />
        </Button>
      </form>
    </li>
  );
}

/** Every lab test or every medicine with its price, searchable. */
function ItemPrices({ kind, list }: { kind: 'LAB_TEST' | 'DRUG'; list: List }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const own = new Map(
    list.prices.filter((row) => row.kind === kind && row.code).map((row) => [row.code, row.price]),
  );
  const base =
    list.prices.find((row) => row.kind === kind && !row.code)?.price ?? list.defaults[kind];
  const items =
    kind === 'LAB_TEST'
      ? LAB_TEST_CODES.map((code) => ({ code, name: t(`labTests.codes.${code}`), unit: undefined }))
      : (list.drugs ?? []).map((drug) => ({ code: drug.id, name: drug.name, unit: drug.unit }));
  const needle = search.trim().toLowerCase();
  const shown = needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
  const title = t(`prices.every.${kind}`);
  return (
    <Card aria-label={title} className="min-w-0 space-y-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted">{t('prices.everyHint', { count: items.length })}</p>
        </div>
        <div className="w-full sm:w-64">
          <Input
            label={t('prices.find')}
            placeholder={t('prices.find')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-xl border border-border">
        {shown.map((item) => (
          <ItemRow
            key={`${item.code}-${own.get(item.code) ?? base}`}
            kind={kind}
            code={item.code}
            name={item.name}
            unit={item.unit}
            price={own.get(item.code) ?? base}
            own={own.has(item.code)}
          />
        ))}
      </ul>
    </Card>
  );
}

export function PricesPage() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: queryKeys.prices,
    queryFn: async () => (await api.get<List>('/prices')).data,
  });
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="max-w-2xl space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('prices.title')}</h2>
        <p className="text-sm text-muted">{t('prices.description')}</p>
      </motion.div>
      {!data?.prices ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          <motion.div {...enter(1)} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {SERVICE_KINDS.map((kind) => (
              <KindCard key={kind} kind={kind} list={data} />
            ))}
          </motion.div>
          <motion.div {...enter(2)} className="grid gap-4 lg:grid-cols-2">
            <ItemPrices kind="LAB_TEST" list={data} />
            <ItemPrices kind="DRUG" list={data} />
          </motion.div>
        </>
      )}
    </div>
  );
}
