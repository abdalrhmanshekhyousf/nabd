import { pushSubscriptionSchema } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, session } from '../middleware/auth.js';
import { pushPublicKey, subscribe, unsubscribe } from '../services/push.service.js';

// Device notifications (task 3.26): the server's public key, and each
// browser's agreement to receive this person's notifications.
export const pushRouter = Router();

pushRouter.use(authenticate);

pushRouter.get('/key', (_req, res) => {
  res.json({ publicKey: pushPublicKey() });
});

pushRouter.post('/subscriptions', async (req, res) => {
  const { auth } = session(req);
  const input = pushSubscriptionSchema.parse(req.body);
  await subscribe(
    auth.hospitalId,
    auth.userId,
    input,
    req.get('user-agent')?.slice(0, 300) ?? null,
  );
  res.status(201).json({ ok: true });
});

pushRouter.delete('/subscriptions', async (req, res) => {
  const { auth } = session(req);
  const { endpoint } = z.object({ endpoint: z.url() }).parse(req.body);
  await unsubscribe(auth.userId, endpoint);
  res.status(204).end();
});
