import { Router } from 'express';
import {
  login,
  logout,
  refresh,
  register,
  registerPatient,
} from '../controllers/auth.controller.js';
import { loginLimit, registerLimit } from '../middleware/rateLimit.js';

export const authRouter = Router();

// Guessing passwords or mass sign-ups are slowed down (task 4.23).
authRouter.post('/login', loginLimit, login);
authRouter.post('/register', registerLimit, register);
authRouter.post('/register/patient', registerLimit, registerPatient);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
