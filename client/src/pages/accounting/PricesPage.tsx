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

type List = { prices: ServicePriceView[]; defaults: Record<ServiceKind, number> };

/** The services that can have their own price, per kind. */
function codesOf(kind: ServiceKind, t: (key: string) => string) {
  if (kind === 'LAB_TEST')
    return LAB_TEST_CODES.map((code) => ({ value: code, label: t(`labTests.codes.${code}`) }));
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
  const exact = own.filter((row) => row.code);
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
      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <motion.div {...enter(1)} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SERVICE_KINDS.map((kind) => (
            <KindCard key={kind} kind={kind} list={data} />
          ))}
        </motion.div>
      )}
    </div>
  );
}
