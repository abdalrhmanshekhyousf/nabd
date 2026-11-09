import { AnimatePresence, motion } from 'framer-motion';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { controlClasses } from '@/components/ui/controlClasses';
import { cn } from '@/lib/cn';
import { calm } from '@/lib/motion';
import { badLine, type MissingLine } from './missing';

// The pharmacist corrects the medicines asked for but missing before sending
// (task 3.11): fix a name or a count, remove one, or add one the system missed.
export function UnavailableEditor({
  lines,
  onChange,
  onReset,
  showErrors,
}: {
  lines: MissingLine[];
  onChange: (lines: MissingLine[]) => void;
  onReset: () => void;
  showErrors: boolean;
}) {
  const { t } = useTranslation();
  const set = (key: string, change: Partial<MissingLine>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...change } : line)));
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">{t('reports.editHint')}</p>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {lines.map((line, index) => {
            const bad = showErrors && badLine(line);
            return (
              <motion.li
                key={line.key}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={calm}
                className="flex items-center gap-2"
              >
                <input
                  aria-label={t('reports.drugName', { n: index + 1 })}
                  aria-invalid={bad && !line.drugName.trim() ? true : undefined}
                  className={cn(controlClasses, 'h-10 min-w-0 flex-1 px-3')}
                  maxLength={120}
                  value={line.drugName}
                  onChange={(event) => set(line.key, { drugName: event.target.value })}
                />
                <input
                  aria-label={t('reports.drugTimes', { n: index + 1 })}
                  aria-invalid={bad && line.drugName.trim() ? true : undefined}
                  className={cn(controlClasses, 'h-10 w-16 shrink-0 px-2 text-center tabular-nums')}
                  inputMode="numeric"
                  dir="ltr"
                  value={line.times}
                  onChange={(event) => set(line.key, { times: event.target.value })}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t('reports.removeDrug', { name: line.drugName || index + 1 })}
                  onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
                  icon={<Trash2 className="size-4 text-danger" />}
                />
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {lines.length === 0 && <p className="text-sm text-muted">{t('reports.nothing')}</p>}
      {showErrors && lines.some(badLine) && (
        <p role="alert" className="text-sm text-danger">
          {t('reports.badLine')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={lines.length >= 30}
          icon={<Plus className="size-4" />}
          onClick={() =>
            onChange([...lines, { key: crypto.randomUUID(), drugName: '', times: '1' }])
          }
        >
          {t('reports.addDrug')}
        </Button>
        <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={onReset}>
          {t('reports.resetDrugs')}
        </Button>
      </div>
    </div>
  );
}
