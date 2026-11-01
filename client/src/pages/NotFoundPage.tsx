import { Link } from 'react-router';

// Placeholder text until i18next is set up in task 1.11.
export function NotFoundPage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-6xl font-bold text-danger">404</p>
      <p className="text-muted">الصفحة غير موجودة</p>
      <Link
        to="/"
        className="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:opacity-90"
      >
        الرئيسية
      </Link>
    </main>
  );
}
