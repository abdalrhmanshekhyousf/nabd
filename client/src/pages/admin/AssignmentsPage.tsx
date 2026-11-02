import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, Check, HeartHandshake, SprayCan } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { DepartmentIcon } from '@/components/departments/DepartmentIcon';
import { departmentLabel, type Department } from '@/components/departments/departmentDisplay';
import { Card, Select, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/cn';

type AssignedDepartment = Pick<Department, 'id' | 'name' | 'code'>;
type Person = { id: string; fullName: string; isActive: boolean };
export type Assignments = {
  departments: AssignedDepartment[];
  nurses: (Person & { departmentId: string | null })[];
  cleaners: (Person & { departmentIds: string[] })[];
};

/** Saves at once: the screen changes first, and goes back if the server refuses. */
function useAssign<Body>(
  url: (id: string) => string,
  apply: (data: Assignments, id: string, body: Body) => Assignments,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Body; message: string }) =>
      api.put(url(id), body),
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.assignments });
      const before = queryClient.getQueryData<Assignments>(queryKeys.assignments);
      if (before) queryClient.setQueryData(queryKeys.assignments, apply(before, id, body));
      return { before };
    },
    onError: (_error, _variables, context) => {
      if (context?.before) queryClient.setQueryData(queryKeys.assignments, context.before);
    },
    onSuccess: (_result, { message }) => notify.success(message),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.assignments }),
        queryClient.invalidateQueries({ queryKey: ['staff'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.departments }),
      ]),
  });
}

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent [&_svg]:size-[18px]">
          {icon}
        </span>
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Empty({ text, to, action }: { text: string; to: string; action: string }) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-8 text-center text-sm text-muted">
      <p>{text}</p>
      <Link to={to} className="font-medium text-accent underline-offset-4 hover:underline">
        {action}
      </Link>
    </Card>
  );
}

function PersonName({ person }: { person: Person }) {
  const { t } = useTranslation();
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-2 font-medium text-foreground">
      <span className="truncate">{person.fullName}</span>
      {!person.isActive && (
        <StatusBadge tone="danger" dot={false}>
          {t('staff.suspended')}
        </StatusBadge>
      )}
    </p>
  );
}

// Admin: nurses into departments, cleaners across departments (task 1.29).
export function AssignmentsPage() {
  const { t } = useTranslation();
  const { data, isPending } = useQuery({
    queryKey: queryKeys.assignments,
    queryFn: async () => (await api.get<Assignments>('/assignments')).data,
  });

  const moveNurse = useAssign<{ departmentId: string }>(
    (id) => `/assignments/nurses/${id}`,
    (current, id, { departmentId }) => ({
      ...current,
      nurses: current.nurses.map((nurse) => (nurse.id === id ? { ...nurse, departmentId } : nurse)),
    }),
  );
  const setCleaner = useAssign<{ departmentIds: string[] }>(
    (id) => `/assignments/cleaners/${id}`,
    (current, id, { departmentIds }) => ({
      ...current,
      cleaners: current.cleaners.map((cleaner) =>
        cleaner.id === id ? { ...cleaner, departmentIds } : cleaner,
      ),
    }),
  );

  if (isPending || !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const { departments, nurses, cleaners } = data;
  const label = (department: AssignedDepartment) => departmentLabel(department, t);
  const byId = new Map(departments.map((department) => [department.id, department]));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <motion.div {...enter(0)} className="max-w-2xl space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('assignments.title')}</h2>
        <p className="text-sm text-muted">{t('assignments.description')}</p>
      </motion.div>

      {departments.length === 0 ? (
        <motion.div {...enter(1)}>
          <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Building2 className="size-7" aria-hidden="true" />
            </span>
            <p className="font-semibold text-foreground">{t('assignments.noDepartmentsTitle')}</p>
            <p className="text-sm text-muted">{t('assignments.noDepartmentsBody')}</p>
            <Link
              to="/admin/departments"
              className="font-medium text-accent underline-offset-4 hover:underline"
            >
              {t('assignments.goToDepartments')}
            </Link>
          </Card>
        </motion.div>
      ) : (
        <>
          <motion.section {...enter(1)} className="space-y-3" aria-labelledby="coverage-title">
            <h3 id="coverage-title" className="font-semibold text-foreground">
              {t('assignments.coverage')}
            </h3>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {departments.map((department) => {
                const nurseCount = nurses.filter((n) => n.departmentId === department.id).length;
                const cleanerCount = cleaners.filter((c) =>
                  c.departmentIds.includes(department.id),
                ).length;
                const uncovered = nurseCount === 0 || cleanerCount === 0;
                return (
                  <motion.li
                    key={department.id}
                    layout
                    transition={calm}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border bg-surface p-3 transition-colors',
                      uncovered ? 'border-warning/40' : 'border-border',
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-accent">
                      <DepartmentIcon code={department.code} className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate font-medium text-foreground">{label(department)}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge tone={nurseCount ? 'success' : 'warning'} dot={false}>
                          {nurseCount
                            ? t('assignments.nursesCount', { count: nurseCount })
                            : t('assignments.noNurse')}
                        </StatusBadge>
                        <StatusBadge tone={cleanerCount ? 'info' : 'warning'} dot={false}>
                          {cleanerCount
                            ? t('assignments.cleanersCount', { count: cleanerCount })
                            : t('assignments.noCleaner')}
                        </StatusBadge>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </motion.section>

          <motion.div {...enter(2)}>
            <Section
              icon={<HeartHandshake />}
              title={t('assignments.nurses')}
              hint={t('assignments.nursesHint')}
            >
              {nurses.length === 0 ? (
                <Empty
                  text={t('assignments.noNurses')}
                  to="/admin/staff"
                  action={t('assignments.goToStaff')}
                />
              ) : (
                <Card className="divide-y divide-border">
                  {nurses.map((nurse) => (
                    <div
                      key={nurse.id}
                      className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4"
                    >
                      <PersonName person={nurse} />
                      <div className="sm:w-64">
                        <Select
                          label={t('assignments.departmentOf', { name: nurse.fullName })}
                          hideLabel
                          placeholder={t('assignments.noDepartment')}
                          required
                          options={departments.map((department) => ({
                            value: department.id,
                            label: label(department),
                          }))}
                          value={nurse.departmentId ?? ''}
                          onChange={(event) => {
                            const department = byId.get(event.target.value);
                            if (!department) return;
                            moveNurse.mutate({
                              id: nurse.id,
                              body: { departmentId: department.id },
                              message: t('assignments.nurseMoved', {
                                name: nurse.fullName,
                                department: label(department),
                              }),
                            });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </Section>
          </motion.div>

          <motion.div {...enter(3)}>
            <Section
              icon={<SprayCan />}
              title={t('assignments.cleaners')}
              hint={t('assignments.cleanersHint')}
            >
              {cleaners.length === 0 ? (
                <Empty
                  text={t('assignments.noCleaners')}
                  to="/admin/staff"
                  action={t('assignments.goToStaff')}
                />
              ) : (
                <Card className="divide-y divide-border">
                  {cleaners.map((cleaner) => (
                    <div key={cleaner.id} className="space-y-2.5 p-3 sm:px-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <PersonName person={cleaner} />
                        <AnimatePresence initial={false}>
                          {cleaner.departmentIds.length === 0 && (
                            <motion.span
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                            >
                              <StatusBadge tone="warning" dot={false}>
                                {t('assignments.unassigned')}
                              </StatusBadge>
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                      <div
                        role="group"
                        aria-label={t('assignments.covers', { name: cleaner.fullName })}
                        className="flex flex-wrap gap-2"
                      >
                        {departments.map((department) => {
                          const on = cleaner.departmentIds.includes(department.id);
                          return (
                            <motion.button
                              key={department.id}
                              type="button"
                              aria-pressed={on}
                              whileTap={{ scale: 0.95 }}
                              onClick={() =>
                                setCleaner.mutate({
                                  id: cleaner.id,
                                  body: {
                                    departmentIds: on
                                      ? cleaner.departmentIds.filter((id) => id !== department.id)
                                      : [...cleaner.departmentIds, department.id],
                                  },
                                  message: t(
                                    on ? 'assignments.cleanerRemoved' : 'assignments.cleanerAdded',
                                    { name: cleaner.fullName, department: label(department) },
                                  ),
                                })
                              }
                              className={cn(
                                'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                                on
                                  ? 'border-accent/60 bg-accent-soft font-medium text-accent'
                                  : 'border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground',
                              )}
                            >
                              {on ? (
                                <Check className="size-3.5" aria-hidden="true" />
                              ) : (
                                <DepartmentIcon code={department.code} className="size-3.5" />
                              )}
                              {label(department)}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </Section>
          </motion.div>
        </>
      )}
    </div>
  );
}
