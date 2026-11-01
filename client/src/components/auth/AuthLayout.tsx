import { motion } from 'framer-motion';
import { Activity, ShieldCheck, Siren } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HeartbeatLine } from '@/components/brand/HeartbeatLine';
import { NabdLogo } from '@/components/brand/NabdLogo';
import { LanguageToggle } from '@/components/language/LanguageToggle';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { enter } from '@/lib/motion';

function BrandPanel() {
  const { t } = useTranslation();
  const features = [
    { icon: Activity, text: t('auth.featureRealtime') },
    { icon: Siren, text: t('auth.featureTriage') },
    { icon: ShieldCheck, text: t('auth.featureSecure') },
  ];

  return (
    <aside className="relative hidden overflow-hidden bg-ink text-clinic lg:flex lg:flex-col lg:justify-between lg:p-12">
      {/* Monitor grid */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(245_247_250/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(245_247_250/0.05)_1px,transparent_1px)] mask-[radial-gradient(ellipse_at_center,black_35%,transparent_80%)] bg-size-[32px_32px]" />
      <motion.div {...enter(0)} className="relative">
        <NabdLogo withWordmark className="text-3xl text-clinic [&_.text-muted]:text-clinic/60" />
      </motion.div>

      <div className="relative space-y-6">
        <motion.h2 {...enter(1)} className="text-4xl leading-tight font-bold">
          {t('auth.brandTitle')}
        </motion.h2>
        <motion.p {...enter(2)} className="max-w-md text-lg text-clinic/70">
          {t('auth.brandBody')}
        </motion.p>
        <ul className="space-y-3">
          {features.map(({ icon: Icon, text }, index) => (
            <motion.li key={text} {...enter(3 + index)} className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-stable/20 text-stable">
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
              <span className="text-clinic/85">{text}</span>
            </motion.li>
          ))}
        </ul>
      </div>

      <HeartbeatLine className="relative -mx-12 h-24 w-[calc(100%+6rem)] text-stable" />
    </aside>
  );
}

// Shared frame of the signed-out pages (sign in, register a hospital): the dark
// brand panel on large screens, language and theme toggles, and a centered column.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />

      <main className="flex min-w-0 flex-col px-4 py-4 sm:px-8 sm:py-6">
        <div className="flex items-center justify-between gap-2">
          <NabdLogo withWordmark className="text-2xl lg:invisible" />
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="flex items-center sm:hidden">
              <LanguageToggle compact />
              <ThemeToggle compact />
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
