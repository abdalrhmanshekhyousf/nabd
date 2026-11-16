import type { AuditEntry } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';

// The admin's activity log (task 4.22): who opened or changed which patient's
// file, newest first, filtered by person or patient, action and dates.
export const auditRouter = Router();

auditRouter.use(authenticate, requireRole('ADMIN'));

const PAGE = 50;

auditRouter.get('/', async (req, res) => {
  const { db } = session(req);
  const { search, action, from, to, page } = z
    .object({
      search: z.string().trim().max(100).default(''),
      action: z.enum(['VIEW', 'EDIT']).optional(),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
      page: z.coerce.number().int().min(0).max(10_000).default(0),
    })
    .parse(req.query);
  const where = {
    ...(action ? { action } : {}),
    ...(search
      ? {
          OR: [
            { userName: { contains: search, mode: 'insensitive' as const } },
            { patientName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
            ...(to ? { lt: new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000) } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: page * PAGE,
      take: PAGE,
    }),
    db.auditLog.count({ where }),
  ]);
  const entries: AuditEntry[] = rows.map((row) => ({
    id: row.id,
    userName: row.userName,
    role: row.role,
    action: row.action,
    patientId: row.patientId,
    patientName: row.patientName,
    path: row.path,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
  }));
  res.json({ entries, total, pageSize: PAGE });
});
