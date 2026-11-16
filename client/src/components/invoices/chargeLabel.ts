import type { ChargeView, InvoiceStatus } from '@nabd/shared';
import type { StatusTone } from '@/components/ui';
import type { TFunction } from 'i18next';

/** A charge line as people read it: the service in the user's language. */
export function chargeLabel(charge: Pick<ChargeView, 'kind' | 'description'>, t: TFunction) {
  const kind = t(`invoices.kinds.${charge.kind}`);
  switch (charge.kind) {
    case 'LAB_TEST':
      return `${kind}: ${t(`labTests.codes.${charge.description}`, { defaultValue: charge.description })}`;
    case 'IMAGING': {
      const [modality, part] = charge.description.split(' · ');
      return `${kind}: ${t(`modalities.${modality}`, { defaultValue: modality })}${part ? ` · ${part}` : ''}`;
    }
    case 'VISIT':
      return charge.description === 'EMERGENCY'
        ? t('invoices.erVisit')
        : `${kind}: ${charge.description}`;
    case 'BED_DAY':
      return kind;
    default:
      return charge.description ? `${kind}: ${charge.description}` : kind;
  }
}

export const INVOICE_TONE: Record<InvoiceStatus, StatusTone> = {
  ISSUED: 'warning',
  PARTIALLY_PAID: 'info',
  PAID: 'success',
  CANCELLED: 'neutral',
};
