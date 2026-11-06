import {
  createInventoryItemSchema,
  inventoryQuerySchema,
  stockMovementSchema,
  updateInventoryItemSchema,
} from '@nabd/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import {
  createItem,
  inventoryCategoryFor,
  itemMovements,
  listItems,
  recordMovement,
  updateItem,
} from '../services/inventory.service.js';

// Stock of the pharmacy, the lab and imaging (task 3.2): each specialist works
// with their own; the admin may look at any (?category=).
export const inventoryRouter = Router();

inventoryRouter.use(
  authenticate,
  requireRole('PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGIST', 'ADMIN'),
);

const idParam = z.object({ id: z.uuid() });

/** The signed-in person, their database and whose stock they work with. */
function context(req: Request) {
  const { auth, db } = session(req);
  const { search, low, category } = inventoryQuerySchema.parse(req.query);
  return { auth, db, search, low, category: inventoryCategoryFor(auth.role, category) };
}

/** Every stock screen updates at once. */
const announce = (hospitalId: string) => emitRefresh(rooms.hospital(hospitalId), [['inventory']]);

inventoryRouter.get('/', async (req, res) => {
  const { db, search, low, category } = context(req);
  res.json({ category, items: await listItems(db, category, { search, low }) });
});

inventoryRouter.post('/', async (req, res) => {
  const { auth, db, category } = context(req);
  const input = createInventoryItemSchema.parse(req.body);
  const item = await createItem(db, auth.hospitalId, auth.userId, category, input);
  announce(auth.hospitalId);
  res.status(201).json({ item });
});

inventoryRouter.patch('/:id', async (req, res) => {
  const { auth, db, category } = context(req);
  const { id } = idParam.parse(req.params);
  const item = await updateItem(db, category, id, updateInventoryItemSchema.parse(req.body));
  announce(auth.hospitalId);
  res.json({ item });
});

inventoryRouter.get('/:id/movements', async (req, res) => {
  const { db, category } = context(req);
  const { id } = idParam.parse(req.params);
  res.json({ movements: await itemMovements(db, category, id) });
});

inventoryRouter.post('/:id/movements', async (req, res) => {
  const { auth, db, category } = context(req);
  const { id } = idParam.parse(req.params);
  const input = stockMovementSchema.parse(req.body);
  const result = await recordMovement(db, auth.hospitalId, auth.userId, category, id, input);
  announce(auth.hospitalId);
  res.status(201).json(result);
});
