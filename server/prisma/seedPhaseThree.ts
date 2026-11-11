// Phase 3 of the demo (task 3.28): a hospital in the middle of a working week.
// Every doctor has hours; ward beds have patients with their admission notes,
// prescriptions waiting at the pharmacy, lab tests (some with results) and
// imaging waiting for radiology; outpatients have visits booked in the coming
// days; a few pharmacy items sit just above their minimum so the next dispense
// raises the low-stock alert. All of it goes through the app's own services,
// like real use. Added once (its first patient marks it done).
import {
  BOOKING_DAYS_AHEAD,
  type CreatePrescriptionData,
  type DepartmentCode,
  type ImagingOrderData,
  type LabTestCode,
} from '@nabd/shared';
import { prisma } from '../src/lib/prisma.js';
import { forHospital } from '../src/lib/scopedPrisma.js';
import { bookAppointment, freeSlots } from '../src/services/appointment.service.js';
import { orderImaging } from '../src/services/imaging.service.js';
import { recordMovement } from '../src/services/inventory.service.js';
import { orderLabTests, recordLabResult, startLabTest } from '../src/services/lab.service.js';
import { addPrescription, addReport } from '../src/services/medicalRecord.service.js';
import { admitPatient } from '../src/services/ward.service.js';

/** Working weeks: mornings Saturday to Thursday, or afternoons four days. */
const MORNINGS = [6, 0, 1, 2, 3, 4].map((weekday) => ({
  weekday,
  startMinute: 540,
  endMinute: 840,
}));
const AFTERNOONS = [0, 1, 2, 3].map((weekday) => ({ weekday, startMinute: 900, endMinute: 1140 }));

type Stay = {
  code: DepartmentCode;
  name: string;
  gender: 'MALE' | 'FEMALE';
  age: number;
  allergies?: string;
  chronic?: string;
  reason: string;
  report: { title: string; diagnosis: string; content: string };
  drugs: CreatePrescriptionData['items'];
  labs: LabTestCode[];
  /** The first test's result, written by the lab. */
  result?: { result: string; abnormal: boolean };
  imaging?: ImagingOrderData;
};

const drug = (
  drugName: string,
  dose: string,
  frequency: string,
  durationDays: number | null,
  instructions: string | null = null,
) => ({
  drugName,
  dose,
  frequency,
  durationDays,
  instructions,
});

const STAYS: Stay[] = [
  {
    code: 'INTERNAL_MEDICINE',
    name: 'خالد العمر',
    gender: 'MALE',
    age: 64,
    chronic: 'سكري نمط 2',
    reason: 'ارتفاع سكر مع جفاف',
    report: {
      title: 'قبول',
      diagnosis: 'فرط سكر الدم مع تجفاف',
      content: 'سكر عشوائي 420، جفاف متوسط. سيرومات وريدية وأنسولين حسب الجدول ومراقبة كل 4 ساعات.',
    },
    drugs: [
      drug('أنسولين سريع', 'حسب الجدول', '3 مرات باليوم', 5, 'قبل الأكل'),
      drug('سيروم ملحي 0.9%', '1000 مل', 'كل 8 ساعات', 2, 'وريدي'),
    ],
    labs: ['RBS', 'ELECTROLYTES', 'CREATININE'],
    result: { result: 'سكر عشوائي 412 mg/dL (مرتفع)', abnormal: true },
  },
  {
    code: 'INTERNAL_MEDICINE',
    name: 'منى الحسن',
    gender: 'FEMALE',
    age: 47,
    allergies: 'السلفا',
    reason: 'ذات رئة',
    report: {
      title: 'قبول',
      diagnosis: 'ذات رئة مكتسبة من المجتمع',
      content: 'حرارة 38.9، سعال منتج وكراكر بالقاعدة اليمنى. صادات وريدية وأكسجين حسب الإشباع.',
    },
    drugs: [
      drug('سيفترياكسون', '1 غ', 'مرة باليوم', 7, 'وريدي'),
      drug('باراسيتامول', '1 غ', 'كل 8 ساعات', 5),
    ],
    labs: ['CBC', 'CRP'],
    result: { result: 'WBC 15.2 (مرتفع) · Neut 85%', abnormal: true },
    imaging: {
      modality: 'XRAY',
      bodyPart: 'صدر',
      reason: 'ارتشاح بالقاعدة اليمنى؟',
      priority: 'URGENT',
    },
  },
  {
    code: 'CARDIOLOGY',
    name: 'جورج حداد',
    gender: 'MALE',
    age: 71,
    chronic: 'ارتفاع ضغط الدم',
    reason: 'قصور قلب معاوض جزئياً',
    report: {
      title: 'قبول',
      diagnosis: 'قصور قلب احتقاني',
      content: 'زلة جهدية وانتفاخ طرفين. مدرات وريدية، تقييد سوائل، ووزن يومي.',
    },
    drugs: [
      drug('فوروسيميد', '40 ملغ', 'مرتين باليوم', 5, 'وريدي'),
      drug('بيسوبرولول', '2.5 ملغ', 'مرة باليوم', 30),
    ],
    labs: ['TROPONIN', 'ELECTROLYTES'],
    result: { result: 'تروبونين ضمن الطبيعي', abnormal: false },
    imaging: {
      modality: 'ECHO',
      bodyPart: 'قلب',
      reason: 'تقييم الكسر القذفي',
      priority: 'ROUTINE',
    },
  },
  {
    code: 'CARDIOLOGY',
    name: 'سلمى قاسم',
    gender: 'FEMALE',
    age: 58,
    reason: 'ألم صدري للمراقبة',
    report: {
      title: 'قبول',
      diagnosis: 'ألم صدري غير نموذجي',
      content: 'تخطيط بدون تغيرات حادة. مراقبة قلبية وتروبونين متسلسل.',
    },
    drugs: [drug('أسبرين', '81 ملغ', 'مرة باليوم', 30)],
    labs: ['TROPONIN', 'LIPIDS'],
  },
  {
    code: 'ORTHOPEDICS',
    name: 'نزار الشامي',
    gender: 'MALE',
    age: 35,
    reason: 'كسر ساق بعد حادث سير',
    report: {
      title: 'قبول',
      diagnosis: 'كسر جسم الظنبوب الأيمن',
      content: 'تثبيت مؤقت بجبيرة، تسكين، ووقاية خثار. تحضير للعمل الجراحي.',
    },
    drugs: [
      drug('إينوكسابارين', '40 ملغ', 'مرة باليوم', 10, 'تحت الجلد'),
      drug('ترامادول', '50 ملغ', 'كل 8 ساعات', 3),
    ],
    labs: ['CBC', 'PT_INR'],
    imaging: { modality: 'XRAY', bodyPart: 'ساق', reason: 'متابعة بعد الرد', priority: 'ROUTINE' },
  },
  {
    code: 'NEUROLOGY',
    name: 'فاطمة الزين',
    gender: 'FEMALE',
    age: 69,
    chronic: 'رجفان أذيني',
    reason: 'ضعف بالطرف الأيسر',
    report: {
      title: 'قبول',
      diagnosis: 'احتشاء دماغي إقفاري',
      content:
        'ضعف 3/5 بالطرف العلوي الأيسر منذ 10 ساعات. خارج نافذة الحل، مضاد صفيحات ومراقبة عصبية.',
    },
    drugs: [drug('أتورفاستاتين', '40 ملغ', 'مرة باليوم مساءً', 30)],
    labs: ['LIPIDS', 'HBA1C'],
    imaging: { modality: 'MRI', bodyPart: 'دماغ', reason: 'تأكيد الاحتشاء', priority: 'URGENT' },
  },
  {
    code: 'GYNECOLOGY',
    name: 'رنا العلي',
    gender: 'FEMALE',
    age: 29,
    reason: 'مراقبة بعد ولادة قيصرية',
    report: {
      title: 'قبول',
      diagnosis: 'بعد قيصرية بيومين',
      content: 'العلامات الحيوية مستقرة، الجرح نظيف. تسكين وتحريك مبكر.',
    },
    drugs: [
      drug('باراسيتامول', '1 غ', 'كل 8 ساعات', 3),
      drug('إيبوبروفين', '400 ملغ', 'مرتين باليوم', 3, 'بعد الأكل'),
    ],
    labs: ['CBC'],
    result: { result: 'Hb 10.4 g/dL (منخفض قليلاً)', abnormal: true },
  },
];

/** Outpatients with visits booked in the coming days (one per department doctor). */
const VISITS: {
  name: string;
  gender: 'MALE' | 'FEMALE';
  age: number;
  doctor: string;
  reason: string;
}[] = [
  {
    name: 'سامر الخطيب',
    gender: 'MALE',
    age: 52,
    doctor: 'dr.cardio.2@nabd.demo',
    reason: 'خفقان متكرر',
  },
  {
    name: 'هالة المصري',
    gender: 'FEMALE',
    age: 44,
    doctor: 'dr.internal.1@nabd.demo',
    reason: 'متابعة غدة درقية',
  },
  {
    name: 'عمار يوسف',
    gender: 'MALE',
    age: 30,
    doctor: 'dr.ortho.1@nabd.demo',
    reason: 'ألم ركبة بعد الرياضة',
  },
  {
    name: 'ليلى حمدان',
    gender: 'FEMALE',
    age: 61,
    doctor: 'dr.eye.1@nabd.demo',
    reason: 'تشوش رؤية',
  },
  {
    name: 'باسل نجار',
    gender: 'MALE',
    age: 38,
    doctor: 'dr.neuro.1@nabd.demo',
    reason: 'صداع مزمن',
  },
  {
    name: 'ديما شحادة',
    gender: 'FEMALE',
    age: 27,
    doctor: 'dr.gyn.1@nabd.demo',
    reason: 'مراجعة حمل',
  },
];

const birth = (age: number) => new Date(Date.UTC(new Date().getUTCFullYear() - age, 2, 15));

export async function seedPhaseThree(hospitalId: string) {
  const db = forHospital(hospitalId);
  const users = await prisma.user.findMany({
    where: { hospitalId },
    select: {
      id: true,
      email: true,
      role: true,
      doctorProfile: { select: { id: true } },
      staffProfile: { select: { department: { select: { code: true } } } },
    },
    orderBy: { email: 'asc' },
  });
  /** The department's people of a role, in a stable order. */
  const staffOf = (code: DepartmentCode, role: 'DOCTOR' | 'NURSE') =>
    users
      .filter((u) => u.role === role && u.staffProfile?.department?.code === code)
      .map((u) => u.id);
  const user = (email: string) => {
    const found = users.find((u) => u.email === email);
    if (!found) throw new Error(`Demo account missing: ${email}`);
    return found.id;
  };

  // 1. Hours for every doctor who has none yet (doctor@ keeps the user's own).
  const scheduled = new Set(
    (
      await prisma.doctorSchedule.findMany({ where: { hospitalId }, select: { doctorId: true } })
    ).map((row) => row.doctorId),
  );
  const doctors = users.filter(
    (u) => u.role === 'DOCTOR' && u.doctorProfile && !scheduled.has(u.id),
  );
  await prisma.doctorSchedule.createMany({
    data: doctors.flatMap((doctor, index) =>
      (index % 3 === 2 ? AFTERNOONS : MORNINGS).map((day) => ({
        hospitalId,
        doctorId: doctor.id,
        ...day,
      })),
    ),
  });
  const hoursAdded = doctors.length;

  // The rest happens once: its first patient marks it done.
  if (await prisma.patient.count({ where: { hospitalId, fullName: STAYS[0]!.name } })) {
    return { hoursAdded, care: false };
  }

  // 2. Patients in ward beds, with what their doctors wrote and ordered.
  const labTech = user('lab@nabd.demo');
  for (const stay of STAYS) {
    const [doctorId] = staffOf(stay.code, 'DOCTOR');
    const [nurseId] = staffOf(stay.code, 'NURSE');
    if (!doctorId || !nurseId) continue;
    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        fullName: stay.name,
        gender: stay.gender,
        dateOfBirth: birth(stay.age),
        medicalRecord: {
          create: {
            hospitalId,
            doctorId,
            allergies: stay.allergies ?? null,
            chronicConditions: stay.chronic ?? null,
          },
        },
      },
    });
    const bed = await prisma.bed.findFirst({
      where: { hospitalId, status: 'EMPTY', room: { department: { code: stay.code } } },
      orderBy: [{ room: { number: 'asc' } }, { label: 'asc' }],
    });
    if (bed) {
      await admitPatient(db, hospitalId, nurseId, {
        bedId: bed.id,
        patientId: patient.id,
        visitId: null,
        notes: stay.reason,
      });
    }
    await addReport(db, hospitalId, doctorId, patient.id, stay.report);
    await addPrescription(db, hospitalId, doctorId, patient.id, { items: stay.drugs, notes: null });
    const tests = await orderLabTests(db, hospitalId, doctorId, patient.id, {
      codes: stay.labs,
      priority: stay.imaging?.priority === 'URGENT' ? 'URGENT' : 'ROUTINE',
      notes: null,
    });
    if (stay.result && tests[0]) {
      await startLabTest(db, hospitalId, labTech, tests[0].id);
      await recordLabResult(db, hospitalId, labTech, tests[0].id, stay.result, null);
    }
    if (stay.imaging) await orderImaging(db, hospitalId, doctorId, patient.id, stay.imaging);
  }

  // 3. Outpatients with visits booked in the coming days.
  const admin = user('admin@nabd.demo');
  let booked = 0;
  for (const [index, visit] of VISITS.entries()) {
    const doctorId = users.find((u) => u.email === visit.doctor)?.id;
    if (!doctorId) continue;
    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        fullName: visit.name,
        gender: visit.gender,
        dateOfBirth: birth(visit.age),
        medicalRecord: { create: { hospitalId } },
      },
    });
    const days = await freeSlots(db, doctorId, { days: BOOKING_DAYS_AHEAD });
    // Spread over the coming days: the first day's first slot, the next day's second…
    const day = days[Math.min(index % 3, days.length - 1)];
    const slot = day?.slots[Math.min(index, day.slots.length - 1)];
    if (!slot) continue;
    await bookAppointment(
      db,
      hospitalId,
      { userId: admin, role: 'ADMIN' },
      {
        doctorId,
        patientId: patient.id,
        startsAt: slot.startsAt,
        reason: visit.reason,
      },
    );
    booked += 1;
  }

  // 4. A few pharmacy items just above their minimum: the next dispense alerts.
  const pharmacist = user('pharmacist@nabd.demo');
  const items = await prisma.inventoryItem.findMany({
    where: { hospitalId, category: 'DRUG', minQuantity: { gt: 5 } },
    orderBy: { name: 'asc' },
  });
  const nearLow = items.filter((item) => item.quantity > item.minQuantity + 2).slice(0, 4);
  for (const item of nearLow) {
    await recordMovement(db, hospitalId, pharmacist, 'DRUG', item.id, {
      kind: 'ADJUST',
      counted: item.minQuantity + 2,
      reason: 'جرد نهاية الأسبوع',
    });
  }

  return { hoursAdded, care: true, stays: STAYS.length, booked, nearLow: nearLow.length };
}
