import type { DepartmentCode } from '@nabd/shared';
import {
  Baby,
  Bone,
  Brain,
  Building2,
  Eye,
  FlaskConical,
  Heart,
  HeartPulse,
  Pill,
  ScanLine,
  Siren,
  Sparkles,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';
import { createElement } from 'react';

const ICONS: Record<DepartmentCode, LucideIcon> = {
  EMERGENCY: Siren,
  OPERATIONS: HeartPulse,
  INTERNAL_MEDICINE: Stethoscope,
  NEUROLOGY: Brain,
  ORTHOPEDICS: Bone,
  CARDIOLOGY: Heart,
  PLASTIC_SURGERY: Sparkles,
  OPHTHALMOLOGY: Eye,
  GYNECOLOGY: Baby,
  LABORATORY: FlaskConical,
  RADIOLOGY: ScanLine,
  PHARMACY: Pill,
};

/** Each built-in department has its own icon; custom ones a building. */
export function DepartmentIcon({
  code,
  className,
}: {
  code: DepartmentCode | null;
  className?: string;
}) {
  return createElement(code ? ICONS[code] : Building2, { className, 'aria-hidden': true });
}
