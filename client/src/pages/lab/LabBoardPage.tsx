import {
  REPORT_MAX_BYTES,
  REPORT_MIME_TYPES,
  type LabBoardItem,
  type ReportMimeType,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCheck,
  Clock,
  FileUp,
  FlaskConical,
  Paperclip,
  Play,
  Siren,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { patientFacts, patientName } from '@/components/patients/patientDisplay';
import { Button, Card, Modal, Spinner, StatusBadge, Textarea } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

const since = (iso: string, now: number) => {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
};

function TestCard({ test, action }: { test: LabBoardItem; action?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const now = useNow(15_000);
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  const name = t(`labTests.codes.${test.code}`);
  const urgent = test.priority === 'URGENT';
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={calm}
    >
      <Card
        aria-label={name}
        className={cn(
          'flex h-full flex-col gap-3 border-s-4 p-4',
          urgent ? 'border-s-danger' : 'border-s-accent',
          test.mine && test.status === 'IN_PROGRESS' && 'ring-1 ring-accent',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
            <FlaskConical
              className={cn('size-4 shrink-0', urgent ? 'text-danger' : 'text-accent')}
              aria-hidden="true"
            />
            {name}
          </p>
          {urgent && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-danger px-1.5 py-0.5 text-xs font-semibold text-danger-foreground">
              <Siren className="size-3" aria-hidden="true" />
              {t('labTests.priorities.URGENT')}
            </span>
          )}
        </div>
        <div className="space-y-0.5 text-sm">
          <p className="font-medium text-foreground">{patientName(test.patient, t)}</p>
          <p className="text-xs text-muted">{patientFacts(test.patient, t)}</p>
        </div>
        {test.notes && (
          <p className="rounded-lg bg-surface-muted/70 px-3 py-2 text-sm text-foreground">
            {test.notes}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Stethoscope className="size-3.5" aria-hidden="true" />
            {t('labBoard.orderedBy', { name: test.doctorName })}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden="true" />
            <bdi>{time.format(new Date(test.createdAt))}</bdi>
            {test.status !== 'DONE' && <span>· {since(test.createdAt, now)}</span>}
          </span>
          {test.status === 'IN_PROGRESS' && !test.mine && test.technicianName && (
            <span className="font-medium text-accent">
              {t('labBoard.by', { name: test.technicianName })}
            </span>
          )}
        </p>
        {test.status === 'DONE' && (
          <div className="space-y-1">
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge tone={test.abnormal ? 'danger' : 'success'}>
                {test.abnormal ? t('labBoard.abnormal') : t('labBoard.normal')}
              </StatusBadge>
              {test.hasResultFile && (
                <StatusBadge tone="info">
                  <Paperclip className="size-3" aria-hidden="true" /> PDF
                </StatusBadge>
              )}
            </div>
            {test.result && (
              <p className="text-sm whitespace-pre-line text-foreground">{test.result}</p>
            )}
          </div>
        )}
        {action}
      </Card>
    </motion.li>
  );
}

function ResultForm({ test, onDone }: { test: LabBoardItem; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [result, setResult] = useState('');
  const [abnormal, setAbnormal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const name = t(`labTests.codes.${test.code}`);

  const save = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append('result', result);
      form.append('abnormal', String(abnormal));
      if (file) form.append('file', file);
      return (
        await api.post<{ test: LabBoardItem }>(`/lab-tests/${test.id}/result`, form, {
          skipErrorToast: true,
        })
      ).data.test;
    },
    onSuccess: () => {
      notify.success(t('labBoard.saved', { test: name, patient: patientName(test.patient, t) }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.labBoard });
      onDone();
    },
    onError: (failure) => {
      setError(describeApiError(failure).message);
      playSound('error');
    },
  });

  const pick = (chosen: File | undefined) => {
    setError(null);
    if (!chosen) return;
    if (!REPORT_MIME_TYPES.includes(chosen.type as ReportMimeType)) {
      setError(t('labBoard.fileType'));
      return playSound('error');
    }
    if (chosen.size > REPORT_MAX_BYTES) {
      setError(t('labBoard.fileTooBig'));
      return playSound('error');
    }
    playSound('tap');
    setFile(chosen);
  };

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!result.trim() && !file) {
          setError(t('labBoard.needOne'));
          return playSound('error');
        }
        save.mutate();
      }}
    >
      <p className="text-sm text-muted">
        {t('labBoard.resultFor', { patient: patientName(test.patient, t) })}
      </p>
      <Textarea
        label={t('labBoard.result')}
        placeholder={t('labBoard.resultPlaceholder')}
        rows={4}
        value={result}
        onChange={(event) => {
          setResult(event.target.value);
          setError(null);
        }}
      />
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{t('labBoard.flag')}</p>
        <div
          role="radiogroup"
          aria-label={t('labBoard.flag')}
          className="inline-flex rounded-lg bg-surface-muted p-1"
        >
          {([false, true] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              role="radio"
              aria-checked={abnormal === value}
              onClick={() => {
                playSound('toggle');
                setAbnormal(value);
              }}
              className={cn(
                'relative rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                abnormal === value ? 'text-foreground' : 'text-muted hover:text-foreground',
              )}
            >
              {abnormal === value && (
                <motion.span
                  layoutId={`lab-flag-${test.id}`}
                  transition={calm}
                  className={cn(
                    'absolute inset-0 rounded-md shadow-soft',
                    value ? 'bg-danger/12' : 'bg-surface',
                  )}
                />
              )}
              <span className="relative">
                {value ? t('labBoard.abnormal') : t('labBoard.normal')}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{t('labBoard.file')}</p>
        <input
          ref={input}
          type="file"
          accept={REPORT_MIME_TYPES.join(',')}
          className="sr-only"
          aria-label={t('labBoard.file')}
          onChange={(event) => pick(event.target.files?.[0])}
        />
        <AnimatePresence mode="wait" initial={false}>
          {file ? (
            <motion.div
              key="file"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={calm}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted/60 px-3 py-2 text-sm"
            >
              <Paperclip className="size-4 shrink-0 text-accent" aria-hidden="true" />
              <span dir="auto" className="min-w-0 flex-1 truncate text-foreground">
                {file.name}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={t('labBoard.removeFile')}
                onClick={() => {
                  setFile(null);
                  if (input.current) input.current.value = '';
                }}
              >
                <X className="size-4" />
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="pick"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={calm}
            >
              <Button
                variant="outline"
                icon={<FileUp className="size-4" />}
                onClick={() => input.current?.click()}
              >
                {t('labBoard.chooseFile')}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:-bottom-5 sm:-mx-5 sm:-mb-5 sm:flex-row sm:justify-end sm:px-5">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={save.isPending} icon={<CheckCheck className="size-4" />}>
          {t('labBoard.save')}
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  tests,
  children,
}: {
  title: string;
  tests: LabBoardItem[];
  children: (test: LabBoardItem) => ReactNode;
}) {
  if (tests.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold text-foreground">
        {title}
        <span className="rounded-full bg-surface-muted px-2 text-xs text-muted tabular-nums">
          {tests.length}
        </span>
      </h3>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>{tests.map(children)}</AnimatePresence>
      </ul>
    </section>
  );
}

// The lab's board (task 3.5): ordered tests, urgent first; take one, enter its
// result (values and/or a PDF) into the patient's file, the doctor is told.
export function LabBoardPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [entering, setEntering] = useState<LabBoardItem | null>(null);
  const { data: tests = [], isPending } = useQuery({
    queryKey: queryKeys.labBoard,
    queryFn: async () => (await api.get<{ tests: LabBoardItem[] }>('/lab-tests')).data.tests,
  });
  const start = useMutation({
    mutationFn: async (test: LabBoardItem) =>
      (
        await api.post<{ test: LabBoardItem }>(`/lab-tests/${test.id}/start`, undefined, {
          skipErrorToast: true,
        })
      ).data.test,
    onSuccess: (test) =>
      notify.success(t('labBoard.started', { test: t(`labTests.codes.${test.code}`) })),
    onError: (error) => notify.error(describeApiError(error).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.labBoard }),
  });

  const waiting = tests.filter((test) => test.status === 'REQUESTED');
  const mine = tests.filter((test) => test.status === 'IN_PROGRESS' && test.mine);
  const others = tests.filter((test) => test.status === 'IN_PROGRESS' && !test.mine);
  const done = tests.filter((test) => test.status === 'DONE');
  const enterButton = (test: LabBoardItem) => (
    <Button
      className="mt-auto w-full"
      icon={<CheckCheck className="size-4" />}
      onClick={() => setEntering(test)}
    >
      {t('labBoard.enterResult')}
    </Button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('labBoard.title')}</h2>
        <p className="text-sm text-muted">{t('labBoard.description')}</p>
      </motion.div>

      {isPending ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : waiting.length + mine.length + others.length === 0 ? (
        <motion.div {...enter(1)}>
          <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Sparkles className="size-8 text-success" aria-hidden="true" />
            <p className="font-semibold text-foreground">{t('labBoard.empty')}</p>
            <p className="text-sm text-muted">{t('labBoard.emptyHint')}</p>
          </Card>
        </motion.div>
      ) : null}

      <motion.div {...enter(1)} className="space-y-6">
        <Section title={t('labBoard.mine')} tests={mine}>
          {(test) => <TestCard key={test.id} test={test} action={enterButton(test)} />}
        </Section>
        <Section title={t('labBoard.waiting')} tests={waiting}>
          {(test) => (
            <TestCard
              key={test.id}
              test={test}
              action={
                <div className="mt-auto flex gap-2">
                  <Button
                    className="flex-1"
                    variant={test.priority === 'URGENT' ? 'danger' : 'primary'}
                    loading={start.isPending && start.variables?.id === test.id}
                    icon={<Play className="size-4 rtl:rotate-180" />}
                    onClick={() => start.mutate(test)}
                  >
                    {t('labBoard.start')}
                  </Button>
                  <Button variant="outline" onClick={() => setEntering(test)}>
                    {t('labBoard.enterResult')}
                  </Button>
                </div>
              }
            />
          )}
        </Section>
        <Section title={t('labBoard.others')} tests={others}>
          {(test) => <TestCard key={test.id} test={test} />}
        </Section>
        <Section title={t('labBoard.done')} tests={done}>
          {(test) => <TestCard key={test.id} test={test} />}
        </Section>
      </motion.div>

      <Modal
        open={entering !== null}
        onClose={() => setEntering(null)}
        title={
          entering ? t('labBoard.resultTitle', { test: t(`labTests.codes.${entering.code}`) }) : ''
        }
      >
        {entering && (
          <ResultForm key={entering.id} test={entering} onDone={() => setEntering(null)} />
        )}
      </Modal>
    </div>
  );
}
