// Shapes of the signed-in session as the API returns them (POST /auth/login,
// POST /auth/refresh, GET /me).

import type { Role } from '@nabd/shared';

export { ROLES, type Role } from '@nabd/shared';

export type SessionHospital = { id: string; name: string; logoUrl: string | null };

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  language: 'AR' | 'EN';
  theme: 'LIGHT' | 'DARK' | 'SYSTEM';
  hospital: SessionHospital;
};

export type AuthResponse = {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
};
