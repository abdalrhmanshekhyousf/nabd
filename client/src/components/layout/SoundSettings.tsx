import { BellRing } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui';
import { playSound } from '@/lib/sound';
import { useSoundStore } from '@/stores/soundStore';

// Sound preferences, shown in the account menu.
export function SoundSettings() {
  const { t } = useTranslation();
  const { enabled, uiSounds, update } = useSoundStore();

  return (
    <div className="space-y-3 border-b border-border p-4">
      <p className="text-xs font-semibold text-muted">{t('sound.title')}</p>
      <Switch
        checked={enabled}
        onChange={(value) => update({ enabled: value })}
        label={t('sound.enabled')}
        description={t('sound.enabledHint')}
      />
      <Switch
        checked={uiSounds}
        onChange={(value) => update({ uiSounds: value })}
        label={t('sound.ui')}
        description={t('sound.uiHint')}
        disabled={!enabled}
      />
      <button
        type="button"
        disabled={!enabled}
        onClick={() => playSound('urgent')}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-surface-muted text-xs font-medium text-foreground transition-colors hover:bg-border focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <BellRing className="size-4 text-danger" aria-hidden="true" />
        {t('sound.testAlert')}
      </button>
    </div>
  );
}
