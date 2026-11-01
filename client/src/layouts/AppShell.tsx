import { useState } from 'react';
import { useLocation } from 'react-router';
import { AnimatedOutlet } from '@/components/layout/AnimatedOutlet';
import { MobileDrawer } from '@/components/layout/MobileDrawer';
import { SidebarContent } from '@/components/layout/SidebarContent';
import { TopBar } from '@/components/layout/TopBar';
import { useSessionStore } from '@/stores/sessionStore';

// Signed-in layout: hospital sidebar on the reading-start side (a drawer below lg),
// top bar, and the page content.
export function AppShell() {
  const user = useSessionStore((state) => state.user);
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState({ open: false, path: pathname });
  // Following a link closes the drawer.
  const menuOpen = drawer.open && drawer.path === pathname;

  // RequireAuth renders the shell only for a signed-in user.
  if (!user) return null;
  const { hospital } = user;

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-e border-border bg-surface lg:block">
        <SidebarContent hospital={hospital} />
      </aside>
      <MobileDrawer
        open={menuOpen}
        onClose={() => setDrawer({ open: false, path: pathname })}
        hospital={hospital}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          user={user}
          hospital={hospital}
          menuOpen={menuOpen}
          onOpenMenu={() => setDrawer({ open: true, path: pathname })}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <AnimatedOutlet scope="page" />
        </main>
      </div>
    </div>
  );
}
