import { zodResolver } from '@hookform/resolvers/zod';
import { hospitalInfoSchema, type HospitalInfoInput, type ValidationKey } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, Mail, MapPin, Phone } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Input,
  StatusBadge,
} from '@/components/ui';
import { queryKeys } from '@/app/queryKeys';
import { LogoUploader } from '@/components/hospital/LogoUploader';
import { api } from '@/lib/api';
import { enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { useSessionStore } from '@/stores/sessionStore';

type Hospital = {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string | null;
  logoUrl: string | null;
};

function toForm(hospital: Hospital): HospitalInfoInput {
  return {
    name: hospital.name,
    address: hospital.address,
    phone: hospital.phone,
    email: hospital.email ?? '',
  };
}

// Admin: the hospital logo (task 1.23) and its name, address and contact details
// (task 1.22).
export function HospitalSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const patchUser = useSessionStore((state) => state.patchUser);
  const sessionHospital = useSessionStore((state) => state.user?.hospital);

  const { data: hospital, isPending } = useQuery({
    queryKey: queryKeys.hospital,
    queryFn: async () => (await api.get<{ hospital: Hospital }>('/hospital')).data.hospital,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<HospitalInfoInput, unknown, z.output<typeof hospitalInfoSchema>>({
    resolver: zodResolver(hospitalInfoSchema),
  });

  // Fill the form once the details arrive (and after each save).
  useEffect(() => {
    if (hospital) reset(toForm(hospital));
  }, [hospital, reset]);

  const save = useMutation({
    mutationFn: async (info: z.output<typeof hospitalInfoSchema>) =>
      (await api.patch<{ hospital: Hospital }>('/hospital', info)).data.hospital,
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.hospital, saved);
      // The sidebar shows the hospital name from the session.
      if (sessionHospital) patchUser({ hospital: { ...sessionHospital, name: saved.name } });
      notify.success(t('settings.saved'));
    },
  });

  const fieldError = (message?: string) => (message ? t(message as ValidationKey) : undefined);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {hospital && (
        <motion.div {...enter(0)}>
          <LogoUploader hospital={hospital} />
        </motion.div>
      )}
      <motion.div {...enter(1)}>
        <Card>
          <CardHeader
            title={t('settings.title')}
            description={t('settings.description')}
            action={
              <AnimatePresence>
                {isDirty && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                  >
                    <StatusBadge tone="warning">{t('settings.unsaved')}</StatusBadge>
                  </motion.span>
                )}
              </AnimatePresence>
            }
          />
          <form noValidate onSubmit={handleSubmit((info) => save.mutate(info))}>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              {isPending ? (
                [0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-[4.5rem] animate-pulse rounded-lg bg-surface-muted" />
                ))
              ) : (
                <>
                  <Input
                    label={t('register.hospitalName')}
                    icon={<Building2 />}
                    required
                    error={fieldError(errors.name?.message)}
                    containerClassName="sm:col-span-2"
                    {...register('name')}
                  />
                  <Input
                    label={t('register.address')}
                    icon={<MapPin />}
                    required
                    error={fieldError(errors.address?.message)}
                    containerClassName="sm:col-span-2"
                    {...register('address')}
                  />
                  <Input
                    label={t('register.phone')}
                    icon={<Phone />}
                    type="tel"
                    dir="ltr"
                    required
                    error={fieldError(errors.phone?.message)}
                    {...register('phone')}
                  />
                  <Input
                    label={`${t('register.hospitalEmail')} (${t('register.optional')})`}
                    icon={<Mail />}
                    type="email"
                    dir="ltr"
                    error={fieldError(errors.email?.message)}
                    {...register('email')}
                  />
                </>
              )}
            </CardBody>
            <CardFooter>
              <Button
                variant="ghost"
                disabled={!isDirty || save.isPending}
                onClick={() => hospital && reset(toForm(hospital))}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!isDirty} loading={save.isPending}>
                {t('settings.save')}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
