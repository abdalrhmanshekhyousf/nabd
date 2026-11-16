import type { NextFunction, Request, Response } from 'express';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { session } from './auth.js';

/** Which patient a request is about, or null when it cannot be told. */
export type PatientOf = (req: Request, db: ScopedPrisma) => Promise<string | null> | string | null;

/**
 * Records every opening (GET) or change (anything else) of a patient's file
 * (task 4.21): who, which patient, when, from where. Written once the request
 * has succeeded, without slowing it down; a failure to write is logged, never
 * shown to the person.
 */
export function auditPatientFile(patientOf: PatientOf) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      void (async () => {
        const { auth, db } = session(req);
        const patientId = await patientOf(req, db);
        const [user, patient] = await Promise.all([
          db.user.findUnique({ where: { id: auth.userId }, select: { fullName: true } }),
          patientId
            ? db.patient.findUnique({
                where: { id: patientId },
                select: { fullName: true, isAnonymous: true },
              })
            : null,
        ]);
        await db.auditLog.create({
          data: {
            hospitalId: auth.hospitalId,
            userId: auth.userId,
            userName: user?.fullName ?? '—',
            role: auth.role,
            action: req.method === 'GET' ? 'VIEW' : 'EDIT',
            patientId,
            patientName: patient ? (patient.isAnonymous ? null : patient.fullName) : null,
            method: req.method,
            path: req.originalUrl.split('?')[0]!,
            ip: req.ip ?? null,
          },
        });
      })().catch((error: unknown) => console.error('audit write failed', error));
    });
    next();
  };
}

/** The :patientId of the path. */
export const patientIdParam: PatientOf = (req) =>
  req.params.patientId ? String(req.params.patientId) : null;
