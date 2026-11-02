import { hospitalSearchSchema } from '@nabd/shared';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

// Open to everyone: what a visitor needs before having an account (task 1.30).
export const publicRouter = Router();

/**
 * Hospitals a patient can sign up at, searched by name. Only the name and the
 * address leave the server; contact details and logos stay behind the login.
 */
publicRouter.get('/hospitals', async (req, res) => {
  const { search } = hospitalSearchSchema.parse(req.query);
  const hospitals = await prisma.hospital.findMany({
    where: search ? { name: { contains: search, mode: 'insensitive' } } : {},
    select: { id: true, name: true, address: true },
    orderBy: { name: 'asc' },
    take: 50,
  });
  res.json({ hospitals });
});
