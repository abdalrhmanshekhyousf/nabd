import {
  IMAGING_MAX_BYTES,
  IMAGING_MAX_FILES,
  REPORT_MIME_TYPES,
  type ImagingBoardItem,
  type RadiologyModality,
  type ReportMimeType,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Clock,
  FileText,
  ImagePlus,
  Images,
  Play,
  ScanLine,
  Send,
  ShieldAlert,
  Siren,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

/** "طبقي محوري · رأس": how a study is named everywhere. */
function useStudyName() {
  const { t } = useTranslation();
  return (study: Pick<ImagingBoardItem, 'modality' | 'bodyPart'>) =>
    `${t(`modalities.${study.modality}`)} · ${study.bodyPart}`;
}

function StudyCard({ study, action }: { study: ImagingBoardItem; action?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const now = useNow(15_000);
  const studyName = useStudyName();
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  const urgent = study.priority === 'URGENT';
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={calm}
    >
      <Card
        aria-label={studyName(study)}
        className={cn(
          'flex h-full flex-col gap-3 border-s-4 p-4',
          urgent ? 'border-s-danger' : 'border-s-accent',
          study.mine && study.status === 'IN_PROGRESS' && 'ring-1 ring-accent',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <ScanLine
              className={cn('size-4 shrink-0', urgent ? 'text-danger' : 'text-accent')}
              aria-hidden="true"
            />
            {study.bodyPart}
          </p>
          {urgent && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-danger px-1.5 py-0.5 text-xs font-semibold text-danger-foreground">
              <Siren className="size-3" aria-hidden="true" />
              {t('labTests.priorities.URGENT')}
            </span>
          )}
        </div>
        <div className="space-y-0.5 text-sm">
          <p className="font-medium text-foreground">{patientName(study.patient, t)}</p>
          <p className="text-xs text-muted">{patientFacts(study.patient, t)}</p>
        </div>
        {study.reason && (
          <p className="rounded-lg bg-surface-muted/70 px-3 py-2 text-sm text-foreground">
            {study.reason}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Stethoscope className="size-3.5" aria-hidden="true" />
            {t('imaging.orderedBy', { name: study.doctorName })}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden="true" />
            <bdi>{time.format(new Date(study.createdAt))}</bdi>
            {study.status !== 'DONE' && <span>· {since(study.createdAt, now)}</span>}
          </span>
          {study.status === 'IN_PROGRESS' && !study.mine && study.radiologistName && (
            <span className="font-medium text-accent">
              {t('radiologyBoard.by', { name: study.radiologistName })}
            </span>
          )}
        </p>
        {study.status === 'DONE' && (
          <div className="space-y-1">
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge tone={study.abnormal ? 'danger' : 'success'}>
                {study.abnormal ? t('radiologyBoard.abnormal') : t('radiologyBoard.normal')}
              </StatusBadge>
              <StatusBadge tone="info">
                <Images className="size-3" aria-hidden="true" />
                {t('radiologyBoard.imageCount', { count: study.imageCount })}
              </StatusBadge>
            </div>
            {study.report && (
              <p className="line-clamp-3 text-sm whitespace-pre-line text-foreground">
                {study.report}
              </p>
            )}
          </div>
        )}
        {action}
      </Card>
    </motion.li>
  );
}

/** A chosen file with its preview (images show, PDFs get an icon). */
type Picked = { file: File; preview: string | null };

function ReportForm({ study, onDone }: { study: ImagingBoardItem; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const studyName = useStudyName();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [report, setReport] = useState('');
  const [abnormal, setAbnormal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Previews are temporary browser URLs: free them when they go.
  const previews = useMemo(() => picked.map((p) => p.preview), [picked]);
  useEffect(() => () => previews.forEach((url) => url && URL.revokeObjectURL(url)), [previews]);

  const add = (files: FileList | null) => {
    setError(null);
    if (!files) return;
    const next = [...picked];
    for (const file of Array.from(files)) {
      if (next.length >= IMAGING_MAX_FILES) {
        setError(t('radiologyBoard.tooMany'));
        playSound('error');
        break;
      }
      if (!REPORT_MIME_TYPES.includes(file.type as ReportMimeType)) {
        setError(t('radiologyBoard.fileType', { name: file.name }));
        playSound('error');
        continue;
      }
      if (file.size > IMAGING_MAX_BYTES) {
        setError(t('radiologyBoard.fileTooBig', { name: file.name }));
        playSound('error');
        continue;
      }
      next.push({
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      });
    }
    if (next.length > picked.length) playSound('tap');
    setPicked(next);
    if (input.current) input.current.value = '';
  };

  const send = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append('report', report);
      form.append('abnormal', String(abnormal));
      for (const { file } of picked) form.append('images', file);
      return (
        await api.post<{ study: ImagingBoardItem }>(`/imaging/${study.id}/report`, form, {
          skipErrorToast: true,
        })
      ).data.study;
    },
    onSuccess: () => {
      notify.success(
        t('radiologyBoard.sent', {
          study: studyName(study),
          patient: patientName(study.patient, t),
        }),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.imagingBoard });
      onDone();
    },
    onError: (failure) => {
      setError(describeApiError(failure).message);
      playSound('error');
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (picked.length === 0) {
          setError(t('radiologyBoard.needImage'));
          return playSound('error');
        }
        if (!report.trim()) {
          setError(t('validation.required'));
          return playSound('error');
        }
        send.mutate();
      }}
    >
      <div className="space-y-1 text-sm">
        <p className="text-muted">
          {t('radiologyBoard.patient', { patient: patientName(study.patient, t) })}
        </p>
        {study.reason && (
          <p className="text-foreground">
            {t('radiologyBoard.question', { reason: study.reason })}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{t('radiologyBoard.images')}</p>
        <input
          ref={input}
          type="file"
          multiple
          accept={REPORT_MIME_TYPES.join(',')}
          className="sr-only"
          aria-label={t('radiologyBoard.images')}
          onChange={(event) => add(event.target.files)}
        />
        <ul
          className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          aria-label={t('radiologyBoard.images')}
        >
          <AnimatePresence initial={false}>
            {picked.map(({ file, preview }, index) => (
              <motion.li
                key={`${file.name}-${index}`}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={calm}
                className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-muted"
              >
                {preview ? (
                  <img src={preview} alt={file.name} className="size-full object-cover" />
                ) : (
                  <span className="flex size-full flex-col items-center justify-center gap-1 p-1 text-center text-xs text-muted">
                    <FileText className="size-6 text-accent" aria-hidden="true" />
                    <span dir="auto" className="line-clamp-2 break-all">
                      {file.name}
                    </span>
                  </span>
                )}
                <button
                  type="button"
                  aria-label={t('radiologyBoard.removeImage', { name: file.name })}
                  onClick={() => {
                    playSound('tap');
                    setPicked((current) => current.filter((_, i) => i !== index));
                  }}
                  className="absolute end-1 top-1 flex size-7 items-center justify-center rounded-full bg-foreground/70 text-surface transition-opacity focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                >
                  <X className="size-4" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
          {picked.length < IMAGING_MAX_FILES && (
            <li>
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-xs text-muted transition-colors hover:border-accent hover:text-accent focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
              >
                <ImagePlus className="size-6" aria-hidden="true" />
                {t('radiologyBoard.addImages')}
              </button>
            </li>
          )}
        </ul>
      </div>

      <Textarea
        label={t('radiologyBoard.report')}
        placeholder={t('radiologyBoard.reportPlaceholder')}
        required
        rows={5}
        value={report}
        onChange={(event) => {
          setReport(event.target.value);
          setError(null);
        }}
      />
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{t('radiologyBoard.flag')}</p>
        <div
          role="radiogroup"
          aria-label={t('radiologyBoard.flag')}
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
                  layoutId={`imaging-flag-${study.id}`}
                  transition={calm}
                  className={cn(
                    'absolute inset-0 rounded-md shadow-soft',
                    value ? 'bg-danger/12' : 'bg-surface',
                  )}
                />
              )}
              <span className="relative">
                {value ? t('radiologyBoard.abnormal') : t('radiologyBoard.normal')}
              </span>
            </button>
          ))}
        </div>
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
        <Button
          type="submit"
          loading={send.isPending}
          icon={<Send className="size-4 rtl:-scale-x-100" />}
        >
          {t('radiologyBoard.send')}
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  studies,
  children,
}: {
  title: string;
  studies: ImagingBoardItem[];
  children: (study: ImagingBoardItem) => ReactNode;
}) {
  if (studies.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold text-foreground">
        {title}
        <span className="rounded-full bg-surface-muted px-2 text-xs text-muted tabular-nums">
          {studies.length}
        </span>
      </h3>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>{studies.map(children)}</AnimatePresence>
      </ul>
    </section>
  );
}

// The radiologist's board (task 3.8): requests of their own type, urgent
// first; take one, send its images and report into the patient's file.
export function RadiologyBoardPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const studyName = useStudyName();
  const [reporting, setReporting] = useState<ImagingBoardItem | null>(null);
  const board = useQuery({
    queryKey: queryKeys.imagingBoard,
    queryFn: async () =>
      (
        await api.get<{ modality: RadiologyModality; studies: ImagingBoardItem[] }>('/imaging', {
          skipErrorToast: true,
        })
      ).data,
    retry: false,
  });
  const start = useMutation({
    mutationFn: async (study: ImagingBoardItem) =>
      (
        await api.post<{ study: ImagingBoardItem }>(`/imaging/${study.id}/start`, undefined, {
          skipErrorToast: true,
        })
      ).data.study,
    onSuccess: (study) => notify.success(t('radiologyBoard.started', { study: studyName(study) })),
    onError: (error) => notify.error(describeApiError(error).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.imagingBoard }),
  });

  const noType = board.isError && describeApiError(board.error).code === 'FORBIDDEN';
  const studies = board.data?.studies ?? [];
  const waiting = studies.filter((s) => s.status === 'REQUESTED');
  const mine = studies.filter((s) => s.status === 'IN_PROGRESS' && s.mine);
  const others = studies.filter((s) => s.status === 'IN_PROGRESS' && !s.mine);
  const done = studies.filter((s) => s.status === 'DONE');
  const sendButton = (study: ImagingBoardItem) => (
    <Button
      className="mt-auto w-full"
      icon={<Send className="size-4 rtl:-scale-x-100" />}
      onClick={() => setReporting(study)}
    >
      {t('radiologyBoard.send')}
    </Button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('radiologyBoard.title')}</h2>
        {board.data && (
          <p className="text-sm text-muted">
            {t('radiologyBoard.description', { modality: t(`modalities.${board.data.modality}`) })}
          </p>
        )}
      </motion.div>

      {board.isPending ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : noType ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <ShieldAlert className="size-8 text-muted" aria-hidden="true" />
          <p className="font-semibold text-foreground">{t('radiologyBoard.noType')}</p>
          <p className="text-sm text-muted">{t('radiologyBoard.noTypeHint')}</p>
        </Card>
      ) : waiting.length + mine.length + others.length === 0 ? (
        <motion.div {...enter(1)}>
          <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Sparkles className="size-8 text-success" aria-hidden="true" />
            <p className="font-semibold text-foreground">{t('radiologyBoard.empty')}</p>
            <p className="text-sm text-muted">{t('radiologyBoard.emptyHint')}</p>
          </Card>
        </motion.div>
      ) : null}

      <motion.div {...enter(1)} className="space-y-6">
        <Section title={t('radiologyBoard.mine')} studies={mine}>
          {(study) => <StudyCard key={study.id} study={study} action={sendButton(study)} />}
        </Section>
        <Section title={t('radiologyBoard.waiting')} studies={waiting}>
          {(study) => (
            <StudyCard
              key={study.id}
              study={study}
              action={
                <div className="mt-auto flex gap-2">
                  <Button
                    className="flex-1"
                    variant={study.priority === 'URGENT' ? 'danger' : 'primary'}
                    loading={start.isPending && start.variables?.id === study.id}
                    icon={<Play className="size-4 rtl:rotate-180" />}
                    onClick={() => start.mutate(study)}
                  >
                    {t('radiologyBoard.start')}
                  </Button>
                  <Button variant="outline" onClick={() => setReporting(study)}>
                    {t('radiologyBoard.send')}
                  </Button>
                </div>
              }
            />
          )}
        </Section>
        <Section title={t('radiologyBoard.others')} studies={others}>
          {(study) => <StudyCard key={study.id} study={study} />}
        </Section>
        <Section title={t('radiologyBoard.done')} studies={done}>
          {(study) => <StudyCard key={study.id} study={study} />}
        </Section>
      </motion.div>

      <Modal
        open={reporting !== null}
        onClose={() => setReporting(null)}
        title={reporting ? t('radiologyBoard.dialog', { study: studyName(reporting) }) : ''}
        size="lg"
      >
        {reporting && (
          <ReportForm key={reporting.id} study={reporting} onDone={() => setReporting(null)} />
        )}
      </Modal>
    </div>
  );
}
