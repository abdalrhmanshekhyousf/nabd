import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

export type TableColumn<Row> = {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Classes for both the header and the cells of this column. */
  className?: string;
  /** Leave this column out of the phone card layout. */
  hideOnMobile?: boolean;
};

type TableProps<Row> = {
  columns: TableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  /** Accessible name, e.g. "Staff list". */
  caption: string;
  emptyMessage?: string;
  loading?: boolean;
  onRowClick?: (row: Row) => void;
};

// A real table from md up; on phones each row becomes a card of label/value pairs,
// so nothing scrolls sideways.
export function Table<Row>({
  columns,
  rows,
  getRowKey,
  caption,
  emptyMessage,
  loading = false,
  onRowClick,
}: TableProps<Row>) {
  const { t } = useTranslation();
  const mobileColumns = columns.filter((column) => !column.hideOnMobile);

  if (loading) {
    return (
      <div className="space-y-2" role="status" aria-label={t('common.loading')}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-muted" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
        {emptyMessage ?? t('common.noData')}
      </p>
    );
  }

  const rowMotion = (index: number) => ({
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.2, delay: Math.min(index, 10) * 0.03 },
  });

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-muted text-muted">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn('px-4 py-3 text-start font-medium', column.className)}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {rows.map((row, index) => (
              <motion.tr
                key={getRowKey(row)}
                {...rowMotion(index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && 'cursor-pointer hover:bg-surface-muted/60')}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('px-4 py-3 text-foreground', column.className)}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden" aria-label={caption}>
        {rows.map((row, index) => (
          <motion.li
            key={getRowKey(row)}
            {...rowMotion(index)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(
              'rounded-xl border border-border bg-surface p-4',
              onRowClick && 'cursor-pointer active:bg-surface-muted',
            )}
          >
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
              {mobileColumns.map((column) => (
                <div key={column.key} className="contents">
                  <dt className="text-muted">{column.header}</dt>
                  <dd className="min-w-0 text-end break-words text-foreground">
                    {column.cell(row)}
                  </dd>
                </div>
              ))}
            </dl>
          </motion.li>
        ))}
      </ul>
    </>
  );
}
