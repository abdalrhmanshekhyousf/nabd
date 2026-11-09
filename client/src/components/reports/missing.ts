import { readCount } from '@/lib/numbers';

export type MissingLine = { key: string; drugName: string; times: string };

/** A line is fine when it has a name and a whole count of at least one. */
export function badLine(line: MissingLine) {
  const times = readCount(line.times);
  return !line.drugName.trim() || !Number.isInteger(times) || times < 1 || times > 9999;
}
