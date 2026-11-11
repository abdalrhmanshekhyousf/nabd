/** A patient's medication reminder (task 3.26). Times are hospital-local "HH:MM". */
export type MedicationReminderView = {
  id: string;
  prescriptionItemId: string | null;
  drugName: string;
  dose: string;
  times: string[];
  startDate: string;
  endDate: string | null;
  active: boolean;
};

/** A medicine on the patient's medications page, with its reminder if set. */
export type MyMedication = {
  prescriptionItemId: string;
  drugName: string;
  dose: string;
  frequency: string;
  durationDays: number | null;
  instructions: string | null;
  doctorName: string;
  prescribedAt: string;
  reminder: MedicationReminderView | null;
};

/**
 * Dose times suggested from the prescription's frequency as the doctor wrote
 * it ("مرتين باليوم", "3 times a day", "كل 8 ساعات"…). The patient can change them.
 */
export function suggestTimes(frequency: string): string[] {
  const text = frequency.toLowerCase();
  const every = /كل\s*(\d+)\s*ساع|every\s*(\d+)\s*h/.exec(text);
  const hours = every ? Number(every[1] ?? every[2]) : 0;
  if (hours >= 4 && hours <= 12) {
    const doses = Math.floor(24 / hours);
    return Array.from({ length: doses }, (_, i) => {
      const hour = (8 + i * hours) % 24;
      return `${String(hour).padStart(2, '0')}:00`;
    });
  }
  if (/أربع|اربع|4|four/.test(text)) return ['08:00', '12:00', '16:00', '20:00'];
  if (/ثلاث|تلات|3|three|thrice/.test(text)) return ['08:00', '14:00', '20:00'];
  if (/مرتين|twice|2|two/.test(text)) return ['08:00', '20:00'];
  if (/مساء|ليل|نوم|night|evening|bed/.test(text)) return ['21:00'];
  return ['08:00'];
}
