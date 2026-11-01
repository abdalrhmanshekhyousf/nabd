import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Joins class names and lets later Tailwind classes override earlier ones,
// so callers can pass className to tweak a component's defaults.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
