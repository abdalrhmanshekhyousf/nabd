// Writes docs/API.md (task 5.5): every route the API serves, grouped by area,
// with who may call it, read from the code itself so it never drifts.
//   npm run docs:api -w server
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

/** Each area: its title, and a line on what it is for. */
const AREAS: Record<string, [string, string]> = {
  '/api/health': ['فحص السيرفر', 'هل السيرفر شغّال.'],
  '/api/auth': ['الدخول والحسابات', 'تسجيل الدخول والخروج، تجديد الجلسة، تسجيل مستشفى أو مريض.'],
  '/api/public': ['صفحات عامة', 'قائمة المستشفيات ليختار منها المريض عند التسجيل.'],
  '/api/me': ['حسابي', 'المستخدم الحالي، تفضيلاته، وأرقام صفحته الرئيسية.'],
  '/api/hospital': ['المستشفى', 'معلومات المستشفى وشعاره.'],
  '/api/departments': ['الأقسام', 'أقسام المستشفى ورؤساؤها.'],
  '/api/rooms': ['الغرف', 'الغرف والأسرّة وحالاتها.'],
  '/api/beds': ['الأسرّة', 'خريطة الأسرّة وسجل كل سرير.'],
  '/api/operating-rooms': ['غرف العمليات', 'الغرف وحالاتها ومراحلها.'],
  '/api/staff': ['الموظفون', 'الحسابات والأدوار، ودوام الأطباء وإجازاتهم.'],
  '/api/assignments': ['توزيع الفرق', 'المنظفون على الأقسام.'],
  '/api/notifications': ['الإشعارات', 'إشعارات المستخدم وقراءتها.'],
  '/api/doctors': ['الأطباء', 'مرضى الطبيب وملفاتهم، الاستدعاءات، الاستشارات، الدوام.'],
  '/api/er': ['الإسعاف', 'التسجيل السريع، تقييم الخطورة، قائمة الانتظار، استدعاء الطبيب، التحويل.'],
  '/api/bookings': ['حجوزات العمليات', 'حجز غرف العمليات وتأجيلها.'],
  '/api/cleaning-requests': ['التنظيف والتعقيم', 'طلبات التنظيف ومهام المنظفين.'],
  '/api/inventory': ['المخزون', 'مخزون الصيدلية والمخبر والأشعة وحركته.'],
  '/api/lab-tests': ['المخبر', 'طلبات التحاليل ونتائجها.'],
  '/api/imaging': ['الأشعة', 'طلبات الصور وتقاريرها.'],
  '/api/pharmacy': ['الصيدلية', 'الوصفات وصرفها.'],
  '/api/reports': ['تقارير الأقسام', 'تقارير الصيدلية والمحاسب للمدير.'],
  '/api/ward': ['أسرّة القسم', 'قبول المرضى بالقسم ونقلهم وتخريجهم.'],
  '/api/appointments': ['المواعيد', 'المواعيد المتاحة والحجز والإلغاء.'],
  '/api/leave': ['الإجازات', 'طلبات الإجازة لكل الموظفين.'],
  '/api/department-requests': ['طلبات الأقسام', 'الشراء والصيانة عن طريق رئيس القسم.'],
  '/api/approvals': ['الموافقات', 'قرارات المدير على الإجازات والشراء والصيانة.'],
  '/api/complaints': ['الشكاوى', 'شكاوى المرضى وردود الإدارة.'],
  '/api/meetings': ['الاجتماعات', 'طلبات المدير للاجتماع مع الأطباء.'],
  '/api/prices': ['لائحة الأسعار', 'أسعار الخدمات والتحاليل والأدوية.'],
  '/api/invoices': ['الفواتير', 'حسابات المرضى والفواتير والدفعات.'],
  '/api/profit': ['الأرباح', 'الربح الشهري وتفاصيله ولوحة المدير.'],
  '/api/audit': ['سجل النشاطات', 'من فتح أو عدّل ملف أي مريض.'],
  '/api/patients': ['المريض', 'ملف المريض الطبي وأدويته وتذكيراته وفواتيره.'],
  '/api/push': ['إشعارات الجهاز', 'اشتراك المتصفح بالإشعارات.'],
  '/api/reception': ['الاستقبال', 'تسجيل المرضى والحالات الإسعافية وتعريف المجهولين.'],
};

const ROLE_NAMES: Record<string, string> = {
  ADMIN: 'المدير',
  DOCTOR: 'الطبيب',
  NURSE: 'الممرض',
  PHARMACIST: 'الصيدلي',
  LAB_TECHNICIAN: 'المخبري',
  RADIOLOGIST: 'فني الأشعة',
  CLEANER: 'المنظف',
  RECEPTIONIST: 'الاستقبال',
  ACCOUNTANT: 'المحاسب',
  PATIENT: 'المريض',
};

/** "requireRole('A', 'B')" or "ROLES.filter(...)" as people read it. */
function who(roles: string | undefined) {
  if (!roles) return null;
  if (roles.includes('ROLES.filter')) {
    const out = [...roles.matchAll(/'(\w+)'/g)].map((m) => ROLE_NAMES[m[1]!] ?? m[1]);
    return `كل الأدوار عدا ${out.join(' و')}`;
  }
  return [...roles.matchAll(/'(\w+)'/g)].map((m) => ROLE_NAMES[m[1]!] ?? m[1]).join('، ');
}

const app = readFileSync(root('src/app.ts'), 'utf8');
const imports = new Map(
  [...app.matchAll(/import \{ ([\w, ]+) \} from '\.\/routes\/([\w.]+)\.js';/g)].flatMap((m) =>
    m[1]!.split(',').map((name) => [name.trim(), m[2]!] as const),
  ),
);

let total = 0;
const sections: string[] = [];
for (const [, prefix, name] of app.matchAll(/app\.use\('(\/api[^']*)', (\w+Router)\)/g)) {
  if (prefix === '/api/dev') continue;
  const source = readFileSync(root(`src/routes/${imports.get(name!)!}.ts`), 'utf8').replace(
    /\s+/g,
    ' ',
  );
  const open = prefix === '/api/auth' || prefix === '/api/health' || prefix === '/api/public';
  const base =
    source.match(new RegExp(`${name}\\.use\\( ?authenticate, ?requireRole\\((.*?)\\)\\)`))?.[1] ??
    undefined;
  const rows: string[] = [];
  const route = new RegExp(
    `${name}\\.(get|post|put|patch|delete)\\( ?['\`]([^'\`]*)['\`],(?: ?requireRole\\(((?:[^()]|\\([^()]*\\))*)\\),)?`,
    'g',
  );
  for (const [, method, template, roles] of source.matchAll(route)) {
    // A path made in a loop ("for (const move of ['start', 'finish'])") is each of them.
    const variable = template!.match(/\$\{(\w+)\}/)?.[1];
    const values = variable
      ? [
          ...(source
            .match(new RegExp(`for \\(const ${variable} of \\[([^\\]]*)\\]`))?.[1]
            ?.matchAll(/'([^']+)'/g) ?? []),
        ].map((m) => m[1]!)
      : [null];
    for (const value of values) {
      const path = value ? template!.replace(`\${${variable}}`, value) : template!;
      const allowed = open
        ? 'بدون تسجيل دخول'
        : (who(roles) ?? who(base) ?? (name === 'staffRouter' ? 'المدير' : 'أي مستخدم مسجّل'));
      rows.push(
        `| \`${method!.toUpperCase()}\` | \`${prefix}${path === '/' ? '' : path}\` | ${allowed} |`,
      );
    }
  }
  total += rows.length;
  const [title, about] = AREAS[prefix!] ?? [prefix, ''];
  sections.push(
    [
      `## ${title} · \`${prefix}\``,
      '',
      about,
      '',
      '| الطريقة | الرابط | مين بيقدر |',
      '| --- | --- | --- |',
      ...rows,
      '',
    ].join('\n'),
  );
}

const doc = [
  '# توثيق الـ API · API reference',
  '',
  `> هالملف بينكتب لحالو من الكود (\`npm run docs:api -w server\`)، فهو دايماً مطابق للسيرفر. ${total} رابط.`,
  '',
  '- **العنوان الأساسي:** `http://localhost:4000/api` بالتطوير، أو عنوان السيرفر أونلاين.',
  '- **الدخول:** `POST /api/auth/login` بيرجّع `accessToken` (صالح 15 دقيقة) بينبعت بكل طلب بـ `Authorization: Bearer <token>`. توكن التجديد بكوكي `httpOnly`، و`POST /api/auth/refresh` بيعطي توكن جديد.',
  '- **العزل:** كل طلب بيشوف بس بيانات مستشفى المستخدم، مهما كانت الأرقام بالرابط.',
  '- **الأخطاء:** كلها بالشكل `{ "error": { "code": "...", "message": "..." } }`؛ الرسالة بلغة `Accept-Language` والـ `code` ثابت.',
  '- **اللحظي:** Socket.io على نفس العنوان؛ السيرفر بيبعت `notification` و`refresh` (مفاتيح لإعادة جلب البيانات).',
  '',
  ...sections,
].join('\n');

writeFileSync(root('../docs/API.md'), doc);
console.info(`docs/API.md: ${total} routes in ${sections.length} areas.`);
