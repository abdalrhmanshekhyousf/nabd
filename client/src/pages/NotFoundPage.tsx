import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { calmSpring, enter } from '@/lib/motion';

const MotionLink = motion.create(Link);

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <motion.p
        className="text-6xl font-bold text-danger"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={calmSpring}
      >
        404
      </motion.p>
      <motion.p {...enter(1)} className="text-muted">
        {t('errors.notFound')}
      </motion.p>
      <MotionLink
        {...enter(2)}
        to="/"
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        className="group inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-soft transition-shadow hover:shadow-lifted focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
      >
        {/* "Back" points left in English and right in Arabic, and nudges on hover */}
        <ArrowLeft
          className="size-4 transition-transform group-hover:-translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:translate-x-0.5"
          aria-hidden="true"
        />
        {t('common.backHome')}
      </MotionLink>
    </main>
  );
}
