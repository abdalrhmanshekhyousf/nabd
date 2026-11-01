# نبض · Nabd

منصّة ويب مفتوحة لأي مستشفى، بتربط كل أقسام المستشفى وموظفيه ومرضاه بنظام واحد لحظي.
أي مدير بيقدر يسجّل ويبني مستشفاه على المنصة، وكل مستشفى بيشتغل بمعزل عن الباقي.

> An open, multi-hospital web platform that connects every department, staff member and patient
> in one real-time system. Each hospital is fully isolated by `hospitalId`.

---

## هيكل المستودع · Repository layout

```
nabd/
├── client/            # الواجهة: React + TypeScript (Vite) + Tailwind + React Router
│   └── src/
│       ├── app/       # الراوتر والإعدادات العامة
│       ├── layouts/   # هياكل الصفحات
│       └── pages/     # الصفحات
├── server/            # الباك إند: Node.js + Express + TypeScript + Prisma
│   └── src/
│       ├── routes/      # تعريف الروابط
│       ├── controllers/ # استقبال الطلب والرد
│       ├── services/    # منطق العمل والوصول للبيانات
│       └── middleware/  # الأخطاء والصلاحيات
├── eslint.config.js   # إعداد ESLint موحّد للمجلدين
├── .prettierrc.json   # إعداد Prettier
└── package.json       # npm workspaces
```

المستودع بيستخدم **npm workspaces**: أمر `npm install` واحد من الجذر بينزّل اعتماديات المجلدين.
بالواجهة، الاختصار `@/` بيأشّر على `client/src`.

## التقنيات · Tech stack

| الجزء              | التقنية                                               |
| ------------------ | ----------------------------------------------------- |
| الواجهة            | React + TypeScript (Vite), Tailwind CSS, React Router |
| الأنيميشن والرسائل | Framer Motion, Sonner                                 |
| البيانات والحالة   | Axios, TanStack Query, Zustand                        |
| الفورمات والتحقق   | React Hook Form + Zod                                 |
| الترجمة            | i18next (العربي والإنكليزي، RTL/LTR)                  |
| السيرفر            | Node.js + Express + TypeScript                        |
| قاعدة البيانات     | PostgreSQL + Prisma                                   |
| الدخول             | JWT + bcrypt                                          |
| اللحظي             | Socket.io                                             |
| الملفات            | Multer                                                |

## المتطلبات · Requirements

- Node.js 20 أو أحدث (`.nvmrc`)
- npm 10 أو أحدث
- PostgreSQL 15 أو أحدث

## البدء · Getting started

```bash
npm install                          # بيولّد Prisma Client كمان
cp server/.env.example server/.env   # وعدّل DATABASE_URL حسب PostgreSQL عندك
npm run db:migrate -w server         # إنشاء الجداول
npm run db:seed -w server            # مستشفى تجريبي ومدير
npm run dev:client   # الواجهة على http://localhost:5173
npm run dev:server   # السيرفر على http://localhost:4000 (فحص: /api/health)
```

قبل التشغيل لازم تعمل قاعدة بيانات فاضية اسمها `nabd` بـ PostgreSQL:

```bash
psql -U postgres -c "CREATE DATABASE nabd;"
```

**حساب المدير التجريبي:** `admin@nabd.demo` / `Admin@12345` (بتتغيّر من `SEED_ADMIN_PASSWORD`).

السيرفر بيفحص الاتصال بقاعدة البيانات أول ما يشتغل، وإذا ما قدر يوصل بيوقف برسالة واضحة.

## الأوامر · Scripts

| الأمر                           | الوظيفة                               |
| ------------------------------- | ------------------------------------- |
| `npm run dev:client`            | تشغيل الواجهة                         |
| `npm run dev:server`            | تشغيل السيرفر                         |
| `npm run build:client`          | بناء الواجهة للإنتاج                  |
| `npm test -w server`            | تشغيل تستات السيرفر                   |
| `npm run db:migrate -w server`  | تطبيق تغييرات الـ schema على القاعدة  |
| `npm run db:seed -w server`     | تعبئة بيانات تجريبية                  |
| `npm run db:reset -w server`    | مسح القاعدة وإعادة بنائها مع الـ seed |
| `npm run db:generate -w server` | إعادة توليد Prisma Client             |
| `npm run db:studio -w server`   | فتح Prisma Studio لتصفّح البيانات     |
| `npm run lint`                  | فحص كل الكود بـ ESLint                |
| `npm run lint:fix`              | فحص وإصلاح تلقائي                     |
| `npm run format`                | تنسيق كل الملفات بـ Prettier          |
| `npm run format:check`          | التأكد إن كل الملفات منسّقة           |

## قواعد الكود · Conventions

- كل الكود TypeScript بوضع `strict`.
- ما في نص مكتوب مباشرة بالواجهة: كل النصوص بـ `client/src/i18n/locales/ar.ts` و`en.ts`. الملفين لازم يكون فيهن نفس المفاتيح، وإذا نقص مفتاح من وحدة منهن البناء بيفشل.
- الاتجاه بيتقلب لحاله مع اللغة: استعمل `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-` بدل `ml-`/`mr-`/`left-`/`right-`، والأيقونات يلي إلها اتجاه (أسهم) بتاخد `rtl:-scale-x-100`.
- كل جدول (ما عدا `Hospital`) فيه `hospitalId`، وكل استعلام بيتقيّد فيه.
- مكوّنات الواجهة الأساسية بـ `client/src/components/ui` (زر، حقل، قائمة، جدول، كرت، نافذة، شارة). استعملها بدل ما تكتب عناصر جديدة، وشوفها كلها على `/dev/ui` وقت التطوير.
- الألوان من متغيرات الهوية بـ `client/src/index.css` بس (`bg-surface`، `text-muted`، `bg-danger`...)، وما في كود hex بالمكوّنات، مشان الوضع الداكن يشتغل لحاله.
- كل صفحة لازم تشتغل من عرض 320px (موبايل) لحد الشاشات الكبيرة، بلا تمرير أفقي. منبلّش بتصميم الموبايل وبعدين منكبّر بـ `sm:` و`md:` و`lg:`.
- المحرّر بينسّق تلقائياً عند الحفظ، وPrettier بيرتّب كلاسات Tailwind (إعدادات `.vscode` مرفقة).

## مراحل التنفيذ · Roadmap

1. **الأساس ولوحة المدير**: هيكل المشروع، الهوية، الدخول، بناء المستشفى والموظفين.
2. **قلب المشروع**: الإسعاف، تقييم ESI، استدعاء الطبيب، غرف العمليات والتعقيم، الإشعارات اللحظية.
3. **الخدمات الطبية**: المخبر، الأشعة، الصيدلية، المخزون، الاستشارات، الأسرّة، المواعيد، لوحة المريض.
4. **الإدارة والمالية**: الاستقبال، المحاسب، الفواتير، الغياب والشراء، الشكاوي، الاجتماعات، الربح، سجل النشاطات.
