import { BellRing, Plus, Search, Siren } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { notify } from '@/lib/notify';
import { playSound, type SoundName } from '@/lib/sound';
import { LanguageToggle } from '@/components/language/LanguageToggle';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Input,
  Modal,
  Select,
  StatusBadge,
  Table,
  Textarea,
  type StatusTone,
  type TableColumn,
} from '@/components/ui';

// Dev-only page (/dev/ui) showing every base component in both themes and
// languages. Not included in production builds.

type DoctorState = 'available' | 'busy' | 'onLeave';
type StaffRow = { id: string; name: string; role: 'doctor' | 'nurse'; status: DoctorState };

const STATUS_TONE: Record<DoctorState, StatusTone> = {
  available: 'success',
  busy: 'warning',
  onLeave: 'neutral',
};

// Sample people are data, not UI text, so they are not translated.
const STAFF: StaffRow[] = [
  { id: '1', name: 'د. سامر الحلبي', role: 'doctor', status: 'available' },
  { id: '2', name: 'د. ريم العلي', role: 'doctor', status: 'busy' },
  { id: '3', name: 'لينا خوري', role: 'nurse', status: 'available' },
  { id: '4', name: 'Omar Haddad', role: 'nurse', status: 'onLeave' },
];

const SOUND_DEMOS = [
  ['tap', 'gallery.soundTap'],
  ['toggle', 'gallery.soundToggle'],
  ['open', 'gallery.soundOpen'],
  ['close', 'gallery.soundClose'],
  ['success', 'gallery.soundSuccess'],
  ['error', 'gallery.soundError'],
  ['warning', 'gallery.soundWarning'],
  ['notify', 'gallery.soundNotify'],
] as const satisfies readonly (readonly [SoundName, `gallery.${string}`])[];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function UiGalleryPage() {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [tableState, setTableState] = useState<'rows' | 'loading' | 'empty'>('rows');

  const columns: TableColumn<StaffRow>[] = [
    { key: 'name', header: t('gallery.name'), cell: (row) => row.name },
    { key: 'role', header: t('gallery.role'), cell: (row) => t(`gallery.${row.role}`) },
    {
      key: 'status',
      header: t('gallery.status'),
      cell: (row) => (
        <StatusBadge tone={STATUS_TONE[row.status]}>{t(`gallery.${row.status}`)}</StatusBadge>
      ),
    },
  ];

  const departments = [
    { value: 'er', label: t('gallery.emergency') },
    { value: 'cardio', label: t('gallery.cardiology') },
    { value: 'or', label: t('gallery.surgery') },
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('gallery.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <Section title={t('gallery.buttons')}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>{t('gallery.primary')}</Button>
          <Button variant="secondary">{t('gallery.secondary')}</Button>
          <Button variant="outline">{t('gallery.outline')}</Button>
          <Button variant="ghost">{t('gallery.ghost')}</Button>
          <Button variant="danger">{t('gallery.danger')}</Button>
          <Button variant="success">{t('gallery.success')}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" icon={<Plus className="size-4" />}>
            {t('gallery.addPatient')}
          </Button>
          <Button icon={<Plus className="size-4" />}>{t('gallery.addPatient')}</Button>
          <Button size="lg" icon={<Plus className="size-5" />}>
            {t('gallery.addPatient')}
          </Button>
          <Button size="icon" variant="outline" aria-label={t('gallery.addPatient')}>
            <Plus className="size-5" />
          </Button>
          <Button loading>{t('gallery.loading')}</Button>
          <Button disabled>{t('gallery.disabled')}</Button>
        </div>
      </Section>

      <Section title={t('gallery.form')}>
        <Card>
          <CardBody className="grid gap-4 pt-4 sm:grid-cols-2 sm:pt-5">
            <Input label={t('gallery.fullName')} hint={t('gallery.fullNameHint')} required />
            <Input
              label={t('gallery.search')}
              placeholder={t('gallery.searchPlaceholder')}
              icon={<Search />}
              type="search"
            />
            <Input
              label={t('gallery.phone')}
              defaultValue="09"
              error={t('gallery.phoneError')}
              inputMode="tel"
              dir="ltr"
            />
            <Select
              label={t('gallery.department')}
              placeholder={t('gallery.chooseDepartment')}
              options={departments}
              required
            />
            <Textarea label={t('gallery.notes')} containerClassName="sm:col-span-2" />
          </CardBody>
          <CardFooter>
            <Button variant="ghost">{t('common.cancel')}</Button>
            <Button>{t('common.save')}</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title={t('gallery.badges')}>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="success">{t('gallery.available')}</StatusBadge>
          <StatusBadge tone="warning">{t('gallery.busy')}</StatusBadge>
          <StatusBadge tone="neutral">{t('gallery.onLeave')}</StatusBadge>
          <StatusBadge tone="info">{t('gallery.pending')}</StatusBadge>
          <StatusBadge tone="danger" pulse>
            {t('gallery.danger')}
          </StatusBadge>
          <StatusBadge tone="neutral" dot={false}>
            {t('gallery.archived')}
          </StatusBadge>
        </div>
        <div className="flex flex-wrap gap-2">
          {([1, 2, 3, 4, 5] as const).map((level) => (
            <StatusBadge key={level} tone={`esi-${level}`} pulse={level === 1}>
              {t('gallery.esiLevel', { level })}
            </StatusBadge>
          ))}
        </div>
      </Section>

      <Section title={t('gallery.toasts')}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => notify.success(t('gallery.toastSuccess'))}>
            {t('gallery.showSuccess')}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              notify.error(t('gallery.toastError'), { description: t('gallery.toastErrorDetail') })
            }
          >
            {t('gallery.showError')}
          </Button>
          <Button variant="outline" onClick={() => notify.warning(t('gallery.toastWarning'))}>
            {t('gallery.showWarning')}
          </Button>
          <Button variant="outline" onClick={() => notify.info(t('gallery.toastInfo'))}>
            {t('gallery.showInfo')}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              void toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
                loading: t('gallery.toastSaving'),
                success: t('gallery.toastSaved'),
              })
            }
          >
            {t('gallery.showPromise')}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast(t('gallery.toastDeleted'), {
                action: { label: t('gallery.undo'), onClick: () => undefined },
              })
            }
          >
            {t('gallery.showAction')}
          </Button>
        </div>
      </Section>

      <Section title={t('gallery.sounds')}>
        <div className="flex flex-wrap gap-2">
          {SOUND_DEMOS.map(([name, labelKey]) => (
            <Button key={name} size="sm" variant="secondary" onClick={() => playSound(name)}>
              {t(labelKey)}
            </Button>
          ))}
          <Button
            size="sm"
            variant="danger"
            onClick={() => notify.alert(t('gallery.urgentAlert'), { urgent: true })}
          >
            {t('gallery.soundUrgent')}
          </Button>
        </div>
      </Section>

      {/* The server sends these over the live connection (task 2.3). */}
      <Section title={t('gallery.liveNotifications')}>
        <p className="text-sm text-muted">{t('gallery.liveHint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<BellRing className="size-4" />}
            onClick={() => void api.post('/dev/notify', { urgent: false })}
          >
            {t('gallery.sendNormal')}
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Siren className="size-4" />}
            onClick={() => void api.post('/dev/notify', { urgent: true })}
          >
            {t('gallery.sendUrgent')}
          </Button>
        </div>
      </Section>

      <Section title={t('gallery.table')}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setTableState('rows')}>
            {t('gallery.showRows')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTableState('loading')}>
            {t('gallery.showLoading')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTableState('empty')}>
            {t('gallery.showEmpty')}
          </Button>
        </div>
        <Table
          caption={t('gallery.staff')}
          columns={columns}
          rows={tableState === 'empty' ? [] : STAFF}
          loading={tableState === 'loading'}
          getRowKey={(row) => row.id}
        />
      </Section>

      <div className="grid gap-10 md:grid-cols-2">
        <Section title={t('gallery.modal')}>
          <div>
            <Button onClick={() => setModalOpen(true)}>{t('gallery.openModal')}</Button>
          </div>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title={t('gallery.modalTitle')}
            description={t('gallery.modalDescription')}
            footer={
              <>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={() => setModalOpen(false)}>{t('common.save')}</Button>
              </>
            }
          >
            <div className="grid gap-4">
              <Input label={t('gallery.fullName')} required />
              <Select
                label={t('gallery.department')}
                placeholder={t('gallery.chooseDepartment')}
                options={departments}
              />
            </div>
          </Modal>
        </Section>

        <Section title={t('gallery.cards')}>
          <Card interactive>
            <CardHeader
              title={t('gallery.cardTitle')}
              description={t('gallery.cardDescription')}
              action={<StatusBadge tone="success">{t('gallery.available')}</StatusBadge>}
            />
            <CardBody>
              <p className="text-sm text-muted">{t('gallery.cardBody')}</p>
            </CardBody>
          </Card>
        </Section>
      </div>
    </main>
  );
}
