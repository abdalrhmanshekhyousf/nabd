import { prisma } from './prisma.js';

// Hospital isolation, enforced in one place: a Prisma client bound to one hospital
// adds the hospital filter to every query and stamps hospitalId on every insert,
// so a forgotten `where` can never leak another hospital's data.
//
// Limits (keep these in mind when writing services):
// - Nested writes (e.g. `user.create({ data: { staffProfile: { create } } })`) are
//   not rewritten: pass hospitalId explicitly in the nested data.
// - Raw SQL ($queryRaw) is not scoped.

type Args = Record<string, unknown>;

const READ_AND_WRITE_BY_WHERE = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

export class CrossHospitalWriteError extends Error {}

function withScope(where: unknown, scope: Args): Args {
  const base = (where ?? {}) as Args;
  const existing = base.AND === undefined ? [] : ([] as unknown[]).concat(base.AND);
  // AND works for unique lookups too (findUnique, update, delete), unlike
  // overwriting a field: a record of another hospital simply doesn't match.
  return { ...base, AND: [...existing, scope] };
}

function stamp(data: unknown, hospitalId: string): Args {
  const row = (data ?? {}) as Args;
  if ('hospital' in row) {
    throw new CrossHospitalWriteError(
      'Use hospitalId, not the hospital relation, in scoped writes',
    );
  }
  if (row.hospitalId !== undefined && row.hospitalId !== hospitalId) {
    throw new CrossHospitalWriteError('Cannot write data for another hospital');
  }
  return { ...row, hospitalId };
}

function guardUpdate(data: unknown, hospitalId: string) {
  const row = (data ?? {}) as Args;
  if ('hospital' in row || (row.hospitalId !== undefined && row.hospitalId !== hospitalId)) {
    throw new CrossHospitalWriteError('Cannot move data to another hospital');
  }
}

/** A Prisma client that can only see and change data of `hospitalId`. */
export function forHospital(hospitalId: string) {
  return prisma.$extends({
    name: 'hospital-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const a = { ...(args as Args) };
          const isHospital = model === 'Hospital';
          const scope: Args = isHospital ? { id: hospitalId } : { hospitalId };

          if (READ_AND_WRITE_BY_WHERE.has(operation)) {
            a.where = withScope(a.where, scope);
            if (operation.startsWith('update')) guardUpdate(a.data, hospitalId);
          } else if (operation === 'create') {
            if (isHospital) throw new CrossHospitalWriteError('Hospitals are created by sign-up');
            a.data = stamp(a.data, hospitalId);
          } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
            if (isHospital) throw new CrossHospitalWriteError('Hospitals are created by sign-up');
            a.data = ([] as unknown[]).concat(a.data).map((row) => stamp(row, hospitalId));
          } else if (operation === 'upsert') {
            if (isHospital) throw new CrossHospitalWriteError('Hospitals are created by sign-up');
            a.where = withScope(a.where, scope);
            a.create = stamp(a.create, hospitalId);
            guardUpdate(a.update, hospitalId);
          }

          return query(a as typeof args);
        },
      },
    },
  });
}

export type ScopedPrisma = ReturnType<typeof forHospital>;
