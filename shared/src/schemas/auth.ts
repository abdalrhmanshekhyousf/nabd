import { z } from 'zod';
import { currentPassword, email, id } from './common.js';

/** POST /auth/login. `hospitalId` is sent when the email exists in several hospitals. */
export const loginSchema = z.object({
  email: email(),
  password: currentPassword(),
  hospitalId: id().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
