import { Router } from 'express';
import {
  login,
  logout,
  refresh,
  register,
  registerPatient,
} from '../controllers/auth.controller.js';

export const authRouter = Router();

authRouter.post('/login', login);
authRouter.post('/register', register);
authRouter.post('/register/patient', registerPatient);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
