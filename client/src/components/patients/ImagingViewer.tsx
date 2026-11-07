import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Maximize,
  Minimize,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm } from '@/lib/motion';
import { openProtectedFile } from '@/lib/protectedFile';
import { playSound } from '@/lib/sound';

type Loaded = { url: string; type: string };

const MIN = 1;
const MAX = 6;
const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));

/**
 * The study's files, fetched with the signed-in person's token (never a public
 * link) and held as temporary blob URLs that are freed when the viewer closes.
 */
function useStudyFiles(studyId: string, count: number) {
  const [files, setFiles] = useState<(Loaded | null)[]>(() => Array(count).fill(null));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    void (async () => {
      for (let index = 0; index < count; index++) {
        try {
          const { data } = await api.get<Blob>(`/imaging/${studyId}/images/${index}`, {
            responseType: 'blob',
            skipErrorToast: true,
          });
          const url = URL.createObjectURL(data);
          urls.push(url);
          if (!alive) break;
          setFiles((current) =>
            current.map((f, i) => (i === index ? { url, type: data.type } : f)),
          );
        } catch (failure) {
          if (alive) setError(describeApiError(failure).message);
          break;
        }
      }
    })();
    return () => {
      alive = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [studyId, count]);
  return { files, error };
}

/** A round button of the viewer's toolbar. */
function ToolButton({
  label,
  icon,
  onClick,
  disabled = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 focus-visible:ring-[3px] focus-visible:ring-white/60 focus-visible:outline-none disabled:opacity-35"
    >
      {icon}
    </button>
  );
}

// The image viewer of an imaging study (task 3.9): one image at a time with
// zoom (buttons, wheel, double click), dragging when zoomed, fullscreen,
// moving between images (buttons, arrow keys, thumbnails). PDFs open in a tab.
export function ImagingViewer({
  studyId,
  count,
  title,
  onClose,
}: {
  studyId: string;
  count: number;
  title: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const { files, error } = useStudyFiles(studyId, count);
  const [index, setIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);
  const current = files[index];

  const zoom = useCallback((next: number) => {
    const value = clamp(next);
    setScale(value);
    if (value === 1) setOffset({ x: 0, y: 0 });
  }, []);
  const go = useCallback(
    (step: number) => {
      setIndex((value) => {
        const next = Math.min(count - 1, Math.max(0, value + step));
        if (next !== value) playSound('tap');
        return next;
      });
      setScale(1);
      setOffset({ x: 0, y: 0 });
    },
    [count],
  );
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen?.();
  }, []);

  useEffect(() => {
    closeButton.current?.focus();
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) void document.exitFullscreen();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // In RTL the next image is to the left.
      const next = rtl ? 'ArrowLeft' : 'ArrowRight';
      const previous = rtl ? 'ArrowRight' : 'ArrowLeft';
      if (event.key === 'Escape' && !document.fullscreenElement) onClose();
      else if (event.key === next) go(1);
      else if (event.key === previous) go(-1);
      else if (event.key === '+' || event.key === '=') zoom(scale + 0.5);
      else if (event.key === '-') zoom(scale - 0.5);
      else if (event.key === '0') zoom(1);
      else if (event.key.toLowerCase() === 'f') toggleFullscreen();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, rtl, scale, toggleFullscreen, zoom]);

  const onPointerDown = (event: PointerEvent) => {
    if (scale === 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, from: offset };
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.from.x + (event.clientX - drag.current.x),
      y: drag.current.from.y + (event.clientY - drag.current.y),
    });
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  return createPortal(
    <motion.div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={calm}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
    >
      <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {title}
          <span className="ms-2 text-white/60 tabular-nums" aria-live="polite">
            {t('imagingViewer.position', { current: index + 1, total: count })}
          </span>
        </p>
        <div className="flex items-center">
          <ToolButton
            label={t('imagingViewer.zoomOut')}
            icon={<ZoomOut className="size-5" />}
            onClick={() => zoom(scale - 0.5)}
            disabled={scale <= MIN}
          />
          <span className="w-12 text-center text-xs text-white/70 tabular-nums" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <ToolButton
            label={t('imagingViewer.zoomIn')}
            icon={<ZoomIn className="size-5" />}
            onClick={() => zoom(scale + 0.5)}
            disabled={scale >= MAX}
          />
          <ToolButton
            label={t('imagingViewer.reset')}
            icon={<RotateCcw className="size-5" />}
            onClick={() => zoom(1)}
            disabled={scale === 1}
          />
          <ToolButton
            label={fullscreen ? t('imagingViewer.exitFullscreen') : t('imagingViewer.fullscreen')}
            icon={fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
            onClick={toggleFullscreen}
          />
          <button
            ref={closeButton}
            type="button"
            aria-label={t('imagingViewer.close')}
            onClick={onClose}
            className="ms-1 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:ring-[3px] focus-visible:ring-white/60 focus-visible:outline-none"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      <div
        className={cn(
          'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden select-none',
          scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
        )}
        onWheel={(event) => zoom(scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15))}
        onDoubleClick={() => zoom(scale > 1 ? 1 : 2.5)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {error ? (
          <p role="alert" className="px-6 text-center text-sm text-white/80">
            {error}
          </p>
        ) : !current ? (
          <Spinner />
        ) : current.type === 'application/pdf' ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <FileText className="size-14 text-white/70" aria-hidden="true" />
            <button
              type="button"
              onClick={() => void openProtectedFile(`/imaging/${studyId}/images/${index}`)}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
            >
              {t('imagingViewer.openPdf')}
            </button>
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.img
              key={current.url}
              src={current.url}
              alt={t('imagingViewer.image', { current: index + 1, title })}
              draggable={false}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, scale, x: offset.x, y: offset.y }}
              exit={{ opacity: 0 }}
              transition={dragging ? { duration: 0 } : calm}
              className="max-h-full max-w-full object-contain"
            />
          </AnimatePresence>
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label={t('imagingViewer.previous')}
              disabled={index === 0}
              onClick={() => go(-1)}
              className="absolute start-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-25"
            >
              <ChevronRight className="size-6 ltr:rotate-180" />
            </button>
            <button
              type="button"
              aria-label={t('imagingViewer.next')}
              disabled={index === count - 1}
              onClick={() => go(1)}
              className="absolute end-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-25"
            >
              <ChevronLeft className="size-6 ltr:rotate-180" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <ul
          className="flex justify-center gap-2 overflow-x-auto px-3 py-3"
          aria-label={t('imagingViewer.thumbnails')}
        >
          {files.map((file, i) => (
            <li key={i}>
              <button
                type="button"
                aria-label={t('imagingViewer.image', { current: i + 1, title })}
                aria-current={i === index}
                onClick={() => go(i - index)}
                className={cn(
                  'flex size-14 items-center justify-center overflow-hidden rounded-md border-2 bg-white/5 transition-colors',
                  i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100',
                )}
              >
                {file?.type.startsWith('image/') ? (
                  <img src={file.url} alt="" className="size-full object-cover" />
                ) : file ? (
                  <FileText className="size-5 text-white/70" aria-hidden="true" />
                ) : (
                  <span className="size-3 animate-pulse rounded-full bg-white/30" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.div>,
    document.body,
  );
}
