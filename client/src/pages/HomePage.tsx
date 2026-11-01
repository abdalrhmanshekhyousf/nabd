import { NabdLogo } from '@/components/brand/NabdLogo';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

// Placeholder text until i18next is set up in task 1.11.
// The theme toggle moves to the top bar in task 1.14.
export function HomePage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="absolute end-4 top-4">
        <ThemeToggle />
      </div>
      <NabdLogo withWordmark className="text-4xl sm:text-5xl" />
      <p className="text-muted">منصّة إدارة المستشفيات</p>
    </main>
  );
}
