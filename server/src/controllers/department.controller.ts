import { departmentSchema } from '@nabd/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { session } from '../middleware/auth.js';
import * as departmentService from '../services/department.service.js';

const idParam = z.object({ id: z.uuid() });

export async function list(req: Request, res: Response) {
  const { db } = session(req);
  res.json({ departments: await departmentService.listDepartments(db) });
}

export async function create(req: Request, res: Response) {
  const { auth, db } = session(req);
  const { name } = departmentSchema.parse(req.body);
  res.status(201).json({
    department: await departmentService.createDepartment(db, auth.hospitalId, name),
  });
}

export async function addDefaults(req: Request, res: Response) {
  const { auth, db } = session(req);
  res.json(await departmentService.addDefaultDepartments(db, auth.hospitalId));
}

export async function rename(req: Request, res: Response) {
  const { db } = session(req);
  const { id } = idParam.parse(req.params);
  const { name } = departmentSchema.parse(req.body);
  res.json({ department: await departmentService.renameDepartment(db, id, name) });
}

export async function remove(req: Request, res: Response) {
  const { db } = session(req);
  const { id } = idParam.parse(req.params);
  await departmentService.deleteDepartment(db, id);
  res.status(204).end();
}
