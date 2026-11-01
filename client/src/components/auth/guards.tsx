import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { canVisit, ROLE_HOME } from '@/app/roles';
import type { Role } from '@/app/session';
import { LoadingScreen } from '@/components/brand/LoadingScreen';
import { notify } from '@/lib/notify';
import { useSessionStore } from '@/stores/sessionStore';

/**
 * Redirects once, when it mounts. Unlike <Navigate>, it doesn't navigate again on
 * re-render, which matters here: page transitions keep the leaving page mounted
 * (and re-rendering) while it fades out, and <Navigate> would loop forever.
 */
function Redirect({ to, state }: { to: string; state?: unknown }) {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate(to, { replace: true, state });
    // Intentionally once, see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Where the login page sends the user back to after signing in. */
export type LoginRedirectState = { from?: string };

/** Signed-in users only; others go to the login page and come back after. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useSessionStore((state) => state.status);
  const location = useLocation();

  if (status === 'loading') return <LoadingScreen />;
  if (status === 'anonymous') {
    const state: LoginRedirectState = { from: location.pathname + location.search };
    return <Redirect to="/login" state={state} />;
  }
  return children;
}

function ForbiddenRedirect({ to }: { to: string }) {
  const { t } = useTranslation();
  useEffect(() => {
    notify.warning(t('auth.forbidden'));
    // Once per refused visit, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Redirect to={to} />;
}

/** Only `role` may enter; anyone else is sent back to their own dashboard. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const user = useSessionStore((state) => state.user);
  if (!user) return null;
  if (user.role !== role) return <ForbiddenRedirect to={ROLE_HOME[user.role]} />;
  return children;
}

/** The login page: already signed-in users skip it. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { status, user } = useSessionStore();
  const location = useLocation();

  if (status === 'loading') return <LoadingScreen />;
  if (user) {
    const from = (location.state as LoginRedirectState | null)?.from;
    return <Redirect to={from && canVisit(from, user.role) ? from : ROLE_HOME[user.role]} />;
  }
  return children;
}

/** "/" and old links: to the user's dashboard, or to the login page. */
export function HomeRedirect() {
  const { status, user } = useSessionStore();
  if (status === 'loading') return <LoadingScreen />;
  return <Redirect to={user ? ROLE_HOME[user.role] : '/login'} />;
}
