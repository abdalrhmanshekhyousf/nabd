// Phase 4 of the demo (task 4.24): the administration at work. Staff have
// salaries and each department its head; there is a price list; patients have
// invoices over the last six months (paid, partly paid, unpaid) and charges not
// invoiced yet; staff asked for leave, heads asked to buy and repair, patients
// complained, the admin called meetings, and last month's revenue report is
// waiting. Salaries, heads and prices are filled where missing; the rest is
// added once (the first invoice marks it done).
import {
  addLocalDays,
  DEFAULT_PRICES,
  headRoleFor,
  zonedDate,
  zonedInstant,
  type DepartmentCode,
  type Role,
  type ServiceKind,
} from '@nabd/shared';
import type { Prisma } from '../src/generated/prisma/client.js';
import { prisma } from '../src/lib/prisma.js';
import { forHospital } from '../src/lib/scopedPrisma.js';
import { lastMonths, monthRange } from '../src/services/profit.service.js';
import { revenueFigures } from '../src/services/report.service.js';

const SALARIES: Partial<Record<Role, number>> = {
  ADMIN: 2_500_000,
  DOCTOR: 3_000_000,
  NURSE: 1_200_000,
  PHARMACIST: 1_500_000,
  LAB_TECHNICIAN: 1_300_000,
  RADIOLOGIST: 1_400_000,
  CLEANER: 700_000,
  RECEPTIONIST: 900_000,
  ACCOUNTANT: 1_200_000,
};

const PRICES: { kind: ServiceKind; code: string; name: string; price: number }[] = [
  { kind: 'VISIT', code: '', name: 'معاينة عيادة', price: 60_000 },
  { kind: 'VISIT', code: 'EMERGENCY', name: 'حالة إسعاف', price: 90_000 },
  { kind: 'LAB_TEST', code: '', name: 'تحليل', price: 30_000 },
  { kind: 'LAB_TEST', code: 'CBC', name: 'تعداد دم كامل', price: 25_000 },
  { kind: 'IMAGING', code: 'XRAY', name: 'صورة أشعة', price: 80_000 },
  { kind: 'IMAGING', code: 'CT', name: 'طبقي محوري', price: 350_000 },
  { kind: 'IMAGING', code: 'MRI', name: 'رنين مغناطيسي', price: 600_000 },
  { kind: 'BED_DAY', code: '', name: 'يوم إقامة', price: 175_000 },
  { kind: 'OPERATION', code: '', name: 'عملية', price: 2_500_000 },
];

/** A charge of a visit: what and which department. */
type Line = {
  kind: ServiceKind;
  code: string;
  description: string;
  quantity: number;
  dept: DepartmentCode;
};

const VISITS: Line[][] = [
  [
    { kind: 'VISIT', code: '', description: 'د. سامر الحلبي', quantity: 1, dept: 'CARDIOLOGY' },
    { kind: 'LAB_TEST', code: 'CBC', description: 'CBC', quantity: 1, dept: 'LABORATORY' },
  ],
  [
    { kind: 'VISIT', code: 'EMERGENCY', description: 'EMERGENCY', quantity: 1, dept: 'EMERGENCY' },
    { kind: 'IMAGING', code: 'XRAY', description: 'XRAY · الصدر', quantity: 1, dept: 'RADIOLOGY' },
    { kind: 'DRUG', code: '', description: 'باراسيتامول 500 ملغ', quantity: 2, dept: 'PHARMACY' },
  ],
  [
    { kind: 'BED_DAY', code: '', description: 'BED_DAY', quantity: 3, dept: 'INTERNAL_MEDICINE' },
    { kind: 'LAB_TEST', code: 'FBS', description: 'FBS', quantity: 1, dept: 'LABORATORY' },
    { kind: 'DRUG', code: '', description: 'أموكسيسيلين 500 ملغ', quantity: 3, dept: 'PHARMACY' },
  ],
  [
    { kind: 'VISIT', code: '', description: 'د. محمد الصباغ', quantity: 1, dept: 'ORTHOPEDICS' },
    { kind: 'IMAGING', code: 'CT', description: 'CT · الركبة', quantity: 1, dept: 'RADIOLOGY' },
  ],
  [
    { kind: 'OPERATION', code: '', description: 'استئصال زائدة', quantity: 1, dept: 'OPERATIONS' },
    { kind: 'BED_DAY', code: '', description: 'BED_DAY', quantity: 4, dept: 'INTERNAL_MEDICINE' },
  ],
  [
    { kind: 'VISIT', code: '', description: 'د. دانة الطويل', quantity: 1, dept: 'OPHTHALMOLOGY' },
    { kind: 'LAB_TEST', code: 'HBA1C', description: 'HBA1C', quantity: 1, dept: 'LABORATORY' },
  ],
];

const METHODS = ['CASH', 'CASH', 'CARD', 'TRANSFER'] as const;

export async function seedPhaseFour(hospitalId: string) {
  const db = forHospital(hospitalId);
  const today = zonedDate(new Date());
  const users = await prisma.user.findMany({
    where: { hospitalId, isActive: true },
    select: {
      id: true,
      email: true,
      role: true,
      fullName: true,
      staffProfile: { select: { id: true, salary: true, departmentId: true } },
    },
    orderBy: { email: 'asc' },
  });
  const byRole = (role: Role) => users.filter((u) => u.role === role);
  const userByEmail = (email: string) => users.find((u) => u.email === email);
  const admin = byRole('ADMIN')[0];
  const accountant = byRole('ACCOUNTANT')[0];

  // Six months of work: salaries from the first of them.
  const months = lastMonths(6);
  const hiredAt = new Date(`${months[0]}-01T00:00:00Z`);

  // Salaries for staff who have none yet.
  let salaried = 0;
  for (const user of users) {
    const salary = SALARIES[user.role];
    if (!salary || !user.staffProfile || Number(user.staffProfile.salary) > 0) continue;
    await prisma.staffProfile.update({
      where: { id: user.staffProfile.id },
      data: { salary, hiredAt },
    });
    salaried += 1;
  }

  // A head for every department without one.
  const departments = await prisma.department.findMany({
    where: { hospitalId },
    select: { id: true, code: true, headId: true },
  });
  let heads = 0;
  for (const department of departments) {
    if (department.headId) continue;
    const role = headRoleFor(department.code);
    const head = users.find(
      (u) => u.role === role && u.staffProfile?.departmentId === department.id,
    );
    if (!head) continue;
    await prisma.department.update({ where: { id: department.id }, data: { headId: head.id } });
    heads += 1;
  }
  const deptId = (code: DepartmentCode) => departments.find((d) => d.code === code)?.id ?? null;
  const headOf = (code: DepartmentCode) => departments.find((d) => d.code === code)?.headId ?? null;

  // The price list.
  for (const row of PRICES) {
    await prisma.servicePrice.upsert({
      where: { hospitalId_kind_code: { hospitalId, kind: row.kind, code: row.code } },
      create: { hospitalId, ...row },
      update: {},
    });
  }
  const priceOf = (kind: ServiceKind, code: string) =>
    PRICES.find((p) => p.kind === kind && p.code === code)?.price ??
    PRICES.find((p) => p.kind === kind && !p.code)?.price ??
    DEFAULT_PRICES[kind];

  if ((await prisma.invoice.count({ where: { hospitalId } })) > 0) {
    return { salaried, heads, activity: false } as const;
  }

  const patients = await prisma.patient.findMany({
    where: { hospitalId, isAnonymous: false },
    select: { id: true, userId: true },
    orderBy: { createdAt: 'asc' },
    take: 40,
  });
  // Patients' visits month by month, busier as the hospital grows, written in
  // bulk: their charges, the invoices for them and the payments.
  const charges: Prisma.InvoiceItemCreateManyInput[] = [];
  const bills: Prisma.InvoiceCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  let number = 0;
  let k = 0;
  // Each month earns about its salaries times this: some months above them
  // (a profit), some below (a loss).
  const salaries = await prisma.staffProfile.aggregate({
    where: { hospitalId, user: { isActive: true } },
    _sum: { salary: true },
  });
  const payroll = Number(salaries._sum.salary ?? 0);
  const FACTORS = [1.22, 1.1, 1.31, 0.94, 1.2, 1.14];
  for (const [m, month] of months.entries()) {
    const { start, end } = monthRange(month);
    const isCurrent = m === months.length - 1;
    // This month too: what the demo shows at a glance is a month that pays its way.
    const target = payroll * FACTORS[m]!;
    let received = 0;
    // A few of this month's last visits are left not invoiced yet.
    let leftOpen = isCurrent ? 6 : 0;
    for (let i = 0; i < 2_000 && (received < target || leftOpen > 0); i += 1) {
      k += 1;
      const patient = patients[(k * 7) % patients.length]!;
      const lines = VISITS[k % VISITS.length]!;
      const day = 1 + ((i * 7 + m * 3) % 28);
      const at = new Date(
        Math.min(
          zonedInstant(
            `${month}-${String(day).padStart(2, '0')}`,
            480 + ((i * 37) % 600),
          ).getTime(),
          Date.now() - 3_600_000,
        ),
      );
      if (at < start || at >= end) continue;
      const items = lines.map((line, j) => {
        const unitPrice = priceOf(line.kind, line.code);
        return {
          hospitalId,
          patientId: patient.id,
          kind: line.kind,
          description: line.description,
          quantity: line.quantity,
          unitPrice,
          total: unitPrice * line.quantity,
          sourceId: `demo-${month}-${i}-${j}`,
          departmentId: deptId(line.dept),
          createdAt: at,
        };
      });
      if (received >= target) {
        charges.push(...items);
        leftOpen -= 1;
        continue;
      }
      const total = items.reduce((sum, item) => sum + item.total, 0);
      // Older months are paid; last month a few partly; this month some not yet.
      const share = isCurrent
        ? [1, 1, 0, 0.5][i % 4]!
        : m === months.length - 2 && i % 6 === 0
          ? 0.4
          : 1;
      const paid = Math.round(total * share);
      received += paid;
      number += 1;
      const invoiceId = crypto.randomUUID();
      bills.push({
        id: invoiceId,
        hospitalId,
        patientId: patient.id,
        number,
        total,
        paid,
        status: paid >= total ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'ISSUED',
        issuedById: accountant?.id ?? null,
        issuedAt: new Date(at.getTime() + 1_800_000),
        createdAt: at,
      });
      charges.push(...items.map((item) => ({ ...item, invoiceId })));
      if (paid > 0) {
        payments.push({
          hospitalId,
          invoiceId,
          amount: paid,
          method: METHODS[k % METHODS.length]!,
          receivedById: accountant?.id ?? null,
          paidAt: new Date(Math.min(at.getTime() + 3_600_000, Date.now() - 60_000)),
        });
      }
    }
  }
  await prisma.invoice.createMany({ data: bills });
  await prisma.invoiceItem.createMany({ data: charges });
  await prisma.payment.createMany({ data: payments });
  const invoices = bills.length;

  // Leave: waiting, approved (one of them away today), rejected.
  const staff = users.filter((u) => u.staffProfile && u.role !== 'ADMIN');
  const leave = (
    who: (typeof users)[number] | undefined,
    from: number,
    to: number,
    reason: string,
    status: 'PENDING' | 'APPROVED' | 'REJECTED',
    note: string | null = null,
  ) =>
    who
      ? prisma.leaveRequest.create({
          data: {
            hospitalId,
            userId: who.id,
            startDate: new Date(`${addLocalDays(today, from)}T00:00:00Z`),
            endDate: new Date(`${addLocalDays(today, to)}T00:00:00Z`),
            reason,
            status,
            decisionNote: note,
            decidedById: status === 'PENDING' ? null : (admin?.id ?? null),
            decidedAt: status === 'PENDING' ? null : new Date(),
          },
        })
      : null;
  await leave(userByEmail('nurse@nabd.demo'), 4, 6, 'سفر عائلي', 'PENDING');
  await leave(staff[3], 10, 12, 'مؤتمر طبي بدمشق', 'PENDING');
  await leave(staff[7], 2, 2, 'موعد عند طبيب', 'PENDING');
  await leave(staff[11], -1, 1, 'مرض', 'APPROVED');
  await leave(staff[15], 15, 20, 'إجازة سنوية', 'APPROVED');
  await leave(staff[19], 3, 9, 'إجازة', 'REJECTED', 'القسم ناقص هالأسبوع، اختار أسبوع تاني');

  // Purchases through the heads: approved ones count as last months' expenses.
  const pharmacy = deptId('PHARMACY');
  const lab = deptId('LABORATORY');
  const purchase = async (
    departmentId: string | null,
    requestedById: string | null,
    items: { name: string; unit: string; quantity: number; unitCost: number }[],
    status: 'PENDING' | 'APPROVED' | 'REJECTED',
    decidedAt: Date | null,
    note: string | null = null,
  ) => {
    if (!departmentId) return;
    await prisma.purchaseRequest.create({
      data: {
        hospitalId,
        departmentId,
        requestedById,
        totalCost: items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0),
        status,
        decidedById: status === 'PENDING' ? null : (admin?.id ?? null),
        decidedAt,
        decisionNote: note,
        createdAt: decidedAt ? new Date(decidedAt.getTime() - 86_400_000) : new Date(),
        items: { create: items.map((item) => ({ hospitalId, ...item })) },
      },
    });
  };
  const monthsAgo = (n: number) => monthRange(months[months.length - 1 - n]!).start;
  const later = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
  await purchase(
    pharmacy,
    headOf('PHARMACY'),
    [
      { name: 'باراسيتامول 500 ملغ', unit: 'علبة', quantity: 200, unitCost: 4_000 },
      { name: 'أموكسيسيلين 500 ملغ', unit: 'علبة', quantity: 120, unitCost: 9_000 },
    ],
    'APPROVED',
    later(monthsAgo(3), 6),
  );
  await purchase(
    lab,
    headOf('LABORATORY'),
    [{ name: 'أنابيب سحب دم', unit: 'كرتونة', quantity: 30, unitCost: 45_000 }],
    'APPROVED',
    later(monthsAgo(2), 10),
  );
  await purchase(
    pharmacy,
    headOf('PHARMACY'),
    [{ name: 'إينوكسابارين 40 ملغ', unit: 'محقنة', quantity: 300, unitCost: 12_000 }],
    'APPROVED',
    later(monthsAgo(1), 12),
  );
  await purchase(
    pharmacy,
    headOf('PHARMACY'),
    [{ name: 'أوميبرازول 20 ملغ', unit: 'علبة', quantity: 80, unitCost: 7_500 }],
    'PENDING',
    null,
  );
  await purchase(
    lab,
    headOf('LABORATORY'),
    [{ name: 'كواشف سكر', unit: 'علبة', quantity: 10, unitCost: 150_000 }],
    'REJECTED',
    later(monthsAgo(1), 4),
    'عنا مخزون بيكفي لآخر الشهر',
  );
  const repair = (
    code: DepartmentCode,
    equipment: string,
    description: string,
    urgency: 'LOW' | 'NORMAL' | 'URGENT',
  ) => {
    const departmentId = deptId(code);
    return departmentId
      ? prisma.repairRequest.create({
          data: {
            hospitalId,
            departmentId,
            requestedById: headOf(code),
            equipment,
            description,
            urgency,
          },
        })
      : null;
  };
  await repair('RADIOLOGY', 'جهاز الطبقي المحوري', 'بيعطي خطأ بالتبريد بعد ساعتين شغل', 'URGENT');
  await repair('INTERNAL_MEDICINE', 'جهاز ضغط ديجيتال', 'القراءات مو مضبوطة', 'NORMAL');

  // Complaints from patients with accounts.
  const accounts = patients.filter((p) => p.userId).map((p) => p.userId!);
  const complaint = (
    userId: string | undefined,
    subject: string,
    body: string,
    code: DepartmentCode | null,
    reply: string | null = null,
  ) =>
    userId
      ? prisma.complaint.create({
          data: {
            hospitalId,
            userId,
            departmentId: code ? deptId(code) : null,
            subject,
            body,
            ...(reply
              ? { status: 'ANSWERED', reply, repliedById: admin?.id ?? null, repliedAt: new Date() }
              : {}),
          },
        })
      : null;
  await complaint(
    accounts[0],
    'تأخير بالمعاينة',
    'استنيت ساعتين عن موعدي بعيادة القلبية.',
    'CARDIOLOGY',
  );
  await complaint(accounts[1] ?? accounts[0], 'النظافة', 'الحمام بالطابق التاني مو نضيف.', null);
  await complaint(
    accounts[0],
    'فاتورة مكررة',
    'انحسب علي التحليل مرتين.',
    'LABORATORY',
    'راجعنا الفاتورة وصلّحنا الخطأ، آسفين.',
  );

  // Meetings with doctors.
  const doctorUser = userByEmail('doctor@nabd.demo');
  const consultant = userByEmail('dr.cardio.2@nabd.demo');
  const at = (days: number, minute: number) => zonedInstant(addLocalDays(today, days), minute);
  if (admin && doctorUser) {
    await prisma.meeting.create({
      data: {
        hospitalId,
        calledById: admin.id,
        doctorId: doctorUser.id,
        startsAt: at(2, 660),
        topic: 'جدول مناوبات القلبية',
      },
    });
  }
  if (admin && consultant) {
    await prisma.meeting.create({
      data: {
        hospitalId,
        calledById: admin.id,
        doctorId: consultant.id,
        startsAt: at(4, 720),
        topic: 'شراء جهاز إيكو جديد',
        status: 'ACCEPTED',
        response: 'تمام، رح جيب العروض معي',
      },
    });
  }

  // Last month's revenue report, sent by the accountant.
  if (accountant) {
    const { start, end } = monthRange(months[months.length - 2]!);
    await prisma.report.create({
      data: {
        hospitalId,
        kind: 'REVENUE',
        periodFrom: start,
        periodTo: end,
        data: await revenueFigures(db, start, end),
        notes: 'شهر منيح، الإيرادات أعلى من الشهر اللي قبلو.',
        authorId: accountant.id,
        authorName: accountant.fullName,
      },
    });
  }

  return { salaried, heads, activity: true, invoices } as const;
}
