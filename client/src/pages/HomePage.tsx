import { NabdLogo } from '@/components/brand/NabdLogo';

// Placeholder text until i18next is set up in task 1.11.
export function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <NabdLogo withWordmark className="text-5xl" />
      <p className="text-muted">منصّة إدارة المستشفيات</p>
    </main>
  );
}
