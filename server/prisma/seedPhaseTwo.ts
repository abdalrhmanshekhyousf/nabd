// Phase 2 of the demo (task 2.27): the hospital's departments and teams, and a
// lively moment to try every screen: doctors in different states, an ER with
// patients at every level, operating rooms mid-cycle and cleaning jobs. The
// activity goes through the app's own services, so it follows every rule
// (levels, calls, bookings, room history, notifications) like real use.
// Safe to run more than once: people are reused and the activity is added once.
import {
  createBookingSchema,
  createCleaningRequestSchema,
  emergencyBookingSchema,
  quickRegistrationSchema,
  triageSchema,
  type DepartmentCode,
  type TriageInput,
} from '@nabd/shared';
import type { DoctorStatus, Role } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';
import { forHospital } from '../src/lib/scopedPrisma.js';
import { createBooking, createEmergencyBooking } from '../src/services/booking.service.js';
import { requestCleaning } from '../src/services/cleaningTask.service.js';
import { addDefaultDepartments } from '../src/services/department.service.js';
import { answerCall } from '../src/services/doctorCall.service.js';
import { callDoctor, registerArrival, saveTriage } from '../src/services/er.service.js';
import { transitionRoom } from '../src/services/orTransition.service.js';

type Person = {
  role: Role;
  email: string;
  fullName: string;
  department: DepartmentCode;
  /** Doctors only. */
  specialty?: string;
  status?: DoctorStatus;
  /** Cleaners cover several departments. */
  covers?: DepartmentCode[];
};

/** The teams beyond the one account per role, each in their department. */
const TEAM: Person[] = [
  {
    role: 'DOCTOR',
    email: 'ortho@nabd.demo',
    fullName: 'د. ريم الأتاسي',
    department: 'ORTHOPEDICS',
    specialty: 'جراحة عظمية',
    status: 'AVAILABLE',
  },
  {
    role: 'DOCTOR',
    email: 'neuro@nabd.demo',
    fullName: 'د. خالد المصري',
    department: 'NEUROLOGY',
    specialty: 'عصبية',
    status: 'BUSY',
  },
  {
    role: 'DOCTOR',
    email: 'gyn@nabd.demo',
    fullName: 'د. هالة النابلسي',
    department: 'GYNECOLOGY',
    specialty: 'نسائية وتوليد',
    status: 'ON_LEAVE',
  },
  {
    role: 'DOCTOR',
    email: 'internal@nabd.demo',
    fullName: 'د. مازن الصباغ',
    department: 'INTERNAL_MEDICINE',
    specialty: 'داخلية',
    status: 'AVAILABLE',
  },
  { role: 'NURSE', email: 'er-nurse@nabd.demo', fullName: 'هدى منصور', department: 'EMERGENCY' },
  { role: 'NURSE', email: 'or-nurse@nabd.demo', fullName: 'رامي حداد', department: 'OPERATIONS' },
  {
    role: 'NURSE',
    email: 'ward-nurse@nabd.demo',
    fullName: 'سلمى عيسى',
    department: 'CARDIOLOGY',
  },
  {
    role: 'CLEANER',
    email: 'cleaner2@nabd.demo',
    fullName: 'أم علي',
    department: 'CARDIOLOGY',
    covers: ['CARDIOLOGY', 'INTERNAL_MEDICINE'],
  },
];

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

/** Today or tomorrow at this local hour, as ISO. */
function at(hour: number, dayOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

async function seedTeams(hospitalId: string, passwordHash: string) {
  const db = forHospital(hospitalId);
  await addDefaultDepartments(db, hospitalId);
  const departments = await prisma.department.findMany({ where: { hospitalId } });
  const dept = (code: DepartmentCode) => departments.find((d) => d.code === code)!.id;

  for (const person of TEAM) {
    const existing = await prisma.user.findUnique({
      where: { hospitalId_email: { hospitalId, email: person.email } },
    });
    if (existing) continue;
    const user = await prisma.user.create({
      data: {
        hospitalId,
        role: person.role,
        email: person.email,
        fullName: person.fullName,
        passwordHash,
        staffProfile: {
          create: {
            hospitalId,
            // A cleaner's departments are their assignments, not one department.
            departmentId: person.role === 'CLEANER' ? null : dept(person.department),
          },
        },
        ...(person.role === 'DOCTOR' && {
          doctorProfile: {
            create: { hospitalId, specialty: person.specialty!, status: person.status },
          },
        }),
      },
    });
    if (person.covers) {
      await prisma.cleanerAssignment.createMany({
        data: person.covers.map((code) => ({
          hospitalId,
          userId: user.id,
          departmentId: dept(code),
        })),
      });
    }
  }

  // The first accounts get a place too: the doctor in cardiology, the cleaner
  // on the operating rooms (sterilization) and the ER.
  await prisma.staffProfile.updateMany({
    where: { hospitalId, departmentId: null, user: { email: 'doctor@nabd.demo' } },
    data: { departmentId: dept('CARDIOLOGY') },
  });
  const cleaner = await prisma.user.findUnique({
    where: { hospitalId_email: { hospitalId, email: 'cleaner@nabd.demo' } },
  });
  if (cleaner) {
    await prisma.cleanerAssignment.createMany({
      data: (['OPERATIONS', 'EMERGENCY'] as const).map((code) => ({
        hospitalId,
        userId: cleaner.id,
        departmentId: dept(code),
      })),
      skipDuplicates: true,
    });
  }
  for (const name of ['غرفة عمليات 1', 'غرفة عمليات 2', 'غرفة عمليات 3']) {
    await prisma.operatingRoom.upsert({
      where: { hospitalId_name: { hospitalId, name } },
      update: {},
      create: { hospitalId, name },
    });
  }
}

/** Normal readings; each arrival changes what makes their level. */
const calm: TriageInput = {
  chiefComplaint: '',
  breathing: true,
  consciousness: 'ALERT',
  pulse: 82,
  systolic: 122,
  diastolic: 78,
  respiratoryRate: 16,
  oxygenSaturation: 98,
  temperature: 36.8,
  painScore: 3,
  expectedExams: 1,
};

async function seedActivity(hospitalId: string) {
  const db = forHospital(hospitalId);
  const user = async (email: string) =>
    prisma.user.findUniqueOrThrow({ where: { hospitalId_email: { hospitalId, email } } });
  const [lina, samer, reem, rami, salma] = await Promise.all(
    [
      'nurse@nabd.demo',
      'doctor@nabd.demo',
      'ortho@nabd.demo',
      'or-nurse@nabd.demo',
      'ward-nurse@nabd.demo',
    ].map(user),
  );
  const rooms = await prisma.operatingRoom.findMany({ where: { hospitalId } });
  const room = (name: string) => rooms.find((r) => r.name === name)!.id;

  /** An ER arrival registered by the demo nurse, assessed, arrived `waited` minutes ago. */
  async function arrival(
    who: Record<string, unknown>,
    triage: Partial<TriageInput> | null,
    waited: number,
  ) {
    const registered = await registerArrival(
      db,
      hospitalId,
      lina.id,
      quickRegistrationSchema.parse({ arrivalNote: null, ...who }),
    );
    if (triage) {
      await saveTriage(
        db,
        lina.id,
        registered.id,
        triageSchema.parse({ ...calm, chiefComplaint: who.chiefComplaint, ...triage }),
      );
    }
    await prisma.triageAssessment.update({
      where: { id: registered.id },
      data: { arrivedAt: minutesAgo(waited) },
    });
    return registered;
  }

  // The ER: one at every level, the urgent ones waiting longer than allowed.
  const crash = await arrival(
    {
      anonymous: true,
      gender: 'MALE',
      chiefComplaint: 'حادث سير، فاقد للوعي',
      arrivalNote: 'شاب بالعشرينات، قميص أزرق، جابه الدفاع المدني',
    },
    { consciousness: 'UNRESPONSIVE', pulse: 130, systolic: 80, diastolic: 50, painScore: 0 },
    6,
  );
  const chest = await arrival(
    {
      anonymous: false,
      fullName: 'محمود الخطيب',
      phone: null,
      dateOfBirth: '1959-07-02',
      nationalId: null,
      gender: 'MALE',
      chiefComplaint: 'ألم شديد بالصدر',
    },
    { pulse: 124, oxygenSaturation: 90, painScore: 8, expectedExams: 2 },
    25,
  );
  await arrival(
    {
      anonymous: false,
      fullName: 'سمر حداد',
      phone: null,
      dateOfBirth: '1991-02-14',
      nationalId: null,
      gender: 'FEMALE',
      chiefComplaint: 'ألم بطني من البارحة',
    },
    { painScore: 6, expectedExams: 2 },
    42,
  );
  await arrival(
    {
      anonymous: false,
      fullName: 'يوسف العلي',
      phone: null,
      dateOfBirth: '2004-09-30',
      nationalId: null,
      gender: 'MALE',
      chiefComplaint: 'التواء بالكاحل',
    },
    { painScore: 4, expectedExams: 1 },
    18,
  );
  await arrival(
    {
      anonymous: false,
      fullName: 'لمى الشامي',
      phone: null,
      dateOfBirth: '1985-11-05',
      nationalId: null,
      gender: 'FEMALE',
      chiefComplaint: 'تجديد وصفة دوا الضغط',
    },
    { painScore: 0, expectedExams: 0 },
    35,
  );
  await arrival(
    {
      anonymous: false,
      fullName: 'نادر سليمان',
      phone: null,
      dateOfBirth: null,
      nationalId: null,
      gender: 'MALE',
      chiefComplaint: 'جرح بالإيد',
    },
    null,
    3,
  );

  // The chest pain waits for the demo doctor's answer; the crash victim was
  // taken by the orthopedic surgeon, who operates on him now.
  await callDoctor(db, hospitalId, lina.id, chest.id, samer.id);
  await callDoctor(db, hospitalId, lina.id, crash.id, reem.id);
  const call = await prisma.doctorCall.findFirstOrThrow({
    where: { triageId: crash.id, status: 'PENDING' },
  });
  await answerCall(db, reem.id, call.id, { accept: true });
  await createEmergencyBooking(
    db,
    hospitalId,
    reem.id,
    emergencyBookingSchema.parse({
      operatingRoomId: room('غرفة عمليات 1'),
      visitId: crash.id,
      procedure: 'تثبيت كسر بالفخذ',
      durationMinutes: 120,
      notes: 'زمرة الدم O-، تم طلب وحدتين',
    }),
  );
  for (const to of ['PREPARING', 'IN_SURGERY'] as const) {
    await transitionRoom(db, { hospitalId, userId: rami.id, roomId: room('غرفة عمليات 1'), to });
  }

  // The demo doctor's patient: an operation just ended (room 3 waits for the
  // sterilization team), one later today and one tomorrow in room 2.
  const patientId = (
    await prisma.medicalRecord.findFirstOrThrow({
      where: { hospitalId, doctorId: samer.id, patient: { user: { email: 'patient@nabd.demo' } } },
    })
  ).patientId;
  await createEmergencyBooking(
    db,
    hospitalId,
    samer.id,
    emergencyBookingSchema.parse({
      operatingRoomId: room('غرفة عمليات 3'),
      patientId,
      procedure: 'تركيب شبكة قلبية',
      durationMinutes: 60,
      notes: null,
    }),
  );
  for (const to of ['PREPARING', 'IN_SURGERY', 'AWAITING_STERILIZATION'] as const) {
    await transitionRoom(db, { hospitalId, userId: rami.id, roomId: room('غرفة عمليات 3'), to });
  }
  const later = new Date(Math.max(Date.now() + 2 * 3_600_000, new Date(at(14)).getTime()));
  later.setMinutes(0, 0, 0);
  for (const [startsAt, procedure, durationMinutes] of [
    [later.toISOString(), 'تخطيط قلب بالجهد', 60],
    [at(10, 1), 'قسطرة قلبية', 90],
  ] as const) {
    await createBooking(
      db,
      hospitalId,
      samer.id,
      createBookingSchema.parse({
        operatingRoomId: room('غرفة عمليات 2'),
        patientId,
        procedure,
        startsAt,
        durationMinutes,
        notes: null,
      }),
    );
  }

  // The surgeon is in the operating room, so she shows busy.
  await prisma.doctorProfile.update({ where: { userId: reem.id }, data: { status: 'BUSY' } });

  // A ward nurse asks for a spill to be cleaned.
  await requestCleaning(
    db,
    hospitalId,
    salma.id,
    createCleaningRequestSchema.parse({ place: 'غرفة 12', note: 'انسكب دوا عالأرض' }),
  );
}

/**
 * The teams always (reusing existing people), and the activity once: it is
 * skipped when the hospital already has ER visits or bookings.
 */
export async function seedPhaseTwo(hospitalId: string, passwordHash: string) {
  await seedTeams(hospitalId, passwordHash);
  const [visits, bookings] = await Promise.all([
    prisma.triageAssessment.count({ where: { hospitalId } }),
    prisma.operationBooking.count({ where: { hospitalId } }),
  ]);
  if (visits + bookings > 0) return false;
  await seedActivity(hospitalId);
  return true;
}

export const PHASE_TWO_ACCOUNTS = TEAM.map(({ role, email }) => ({ role, email }));
